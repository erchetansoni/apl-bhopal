import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['*://*.linkedin.com/*'],
  main() {
    console.log('LinkedIn Scraper content script loaded.');

    let isScraping = false;

    const log = (msg: string) => {
      console.log(`[Scraper] ${msg}`);
      chrome.runtime.sendMessage({ type: "LOG", payload: msg });
    };

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const extractData = (card: Element) => {
      // Extract author name
      const authorNameEl = card.querySelector('.update-components-actor__title span[dir="ltr"] > span')
        || card.querySelector('.update-components-actor__name span[dir="ltr"]')
        || card.querySelector('.update-components-actor__name')
        || card.querySelector('.feed-shared-actor__name');

      // Extract raw content of the entire post
      const contentEl = card.querySelector('.feed-shared-inline-show-more-text')
        || card.querySelector('.feed-shared-update-v2__description')
        || card.querySelector('.update-components-text')
        || card.querySelector('.feed-shared-update-v2__commentary');
      const rawContent = contentEl?.textContent?.trim() || 'N/A';
      
      const emails = [...new Set(rawContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
      const links = [...new Set(rawContent.match(/https?:\/\/[^\s]+/g) || [])];
      
      // Basic phone number extraction (allow +, spaces, dots, dashes, parens)
      const rawContactInfo = rawContent.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4,6}/g) || [];
      const contactInfo = [...new Set(rawContactInfo)]
        .map(s => s.trim())
        .filter(s => s.replace(/\D/g, '').length >= 7 && s.replace(/\D/g, '').length <= 15);
      
      const jobTypeMatches = rawContent.match(/\b(remote|on-site|onsite|hybrid)\b/gi) || [];
      const jobTypes = [...new Set(jobTypeMatches.map(j => j.toLowerCase()))];

      return {
        authorName: authorNameEl?.textContent?.trim() || 'N/A',
        contactInformation: contactInfo.length > 0 ? contactInfo.join(', ') : 'N/A',
        emails: emails.length > 0 ? emails.join(', ') : 'N/A',
        links: links.length > 0 ? links.join(', ') : 'N/A',
        jobType: jobTypes.length > 0 ? jobTypes.join(', ') : 'N/A',
        allContent: rawContent
      };
    };

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "START_SCRAPING") {
        if (isScraping) {
          log("Already scraping...");
          sendResponse({ status: "already_running" });
          return;
        }
        
        isScraping = true;
        const limit = message.limit || 10;
        log(`Started scraping with limit: ${limit}`);
        
        // Start async scrape
        (async () => {
          const results: any[] = [];
          let previousScrollHeight = 0;
          let retries = 0;
          
          while (isScraping && results.length < limit) {
            // Select post cards
            const cards = Array.from(document.querySelectorAll('.feed-shared-update-v2, .search-result__occluded-item, [data-urn^="urn:li:activity:"]'));
            
            for (const card of cards) {
              if (!isScraping || results.length >= limit) break;
              
              if (card.hasAttribute('data-scraped')) continue;
              
              const data = extractData(card);
              // Filter out completely empty rows
              if (data.authorName !== 'N/A' || data.allContent !== 'N/A') {
                results.push(data);
                log(`Scraped post by: ${data.authorName.substring(0, 20)}... (${results.length}/${limit})`);
              }
              // Mark as scraped even if it's N/A to avoid reprocessing
              card.setAttribute('data-scraped', 'true');
            }
            
            if (results.length >= limit || !isScraping) break;
            
            // Scroll down
            log("Scrolling to load more...");
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(2000);
            
            if (document.body.scrollHeight === previousScrollHeight) {
              retries++;
              if (retries > 3) {
                log("No more content loading. Stopping scrape.");
                break;
              }
            } else {
              retries = 0;
              previousScrollHeight = document.body.scrollHeight;
            }
          }
          
          isScraping = false;
          chrome.runtime.sendMessage({ 
            type: "SCRAPE_COMPLETE", 
            payload: { data: results } 
          });
          
        })();

        sendResponse({ status: "started" });
      } else if (message.action === "STOP_SCRAPING") {
        log("Received stop signal.");
        isScraping = false;
        sendResponse({ status: "stopped" });
      }
      return true; 
    });
  }
});
