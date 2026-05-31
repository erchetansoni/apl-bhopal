document.addEventListener("DOMContentLoaded", () => {
  const helpBtn = document.getElementById("helpBtn") as HTMLButtonElement;
  const helpSection = document.getElementById("helpSection") as HTMLDivElement;
  const limitInput = document.getElementById("limit") as HTMLInputElement;
  const keywordsInput = document.getElementById("keywords") as HTMLInputElement;
  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
  const exportCsvBtn = document.getElementById("exportCsvBtn") as HTMLButtonElement;
  const exportJsonBtn = document.getElementById("exportJsonBtn") as HTMLButtonElement;
  const logArea = document.getElementById("logArea") as HTMLTextAreaElement;

  let scrapedData: any[] = [];
  let isScraping = false;

  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    logArea.value += `[${time}] ${msg}\n`;
    logArea.scrollTop = logArea.scrollHeight;
  };

  helpBtn.addEventListener("click", () => {
    helpSection.classList.toggle("hidden");
  });

  const setScrapingState = (scraping: boolean) => {
    isScraping = scraping;
    if (scraping) {
      keywordsInput.disabled = true;
      startBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      exportCsvBtn.disabled = true;
      exportJsonBtn.disabled = true;
    } else {
      keywordsInput.disabled = false;
      startBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
      if (scrapedData.length > 0) {
        exportCsvBtn.disabled = false;
        exportJsonBtn.disabled = false;
      }
    }
  };

  startBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      log("Error: No active tab found.");
      return;
    }

    const keywords = keywordsInput.value.trim();
    if (!keywords) {
      log("Error: Please enter keywords to search.");
      return;
    }

    const targetUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keywords)}&origin=SWITCH_SEARCH_VERTICAL&sid=5M!`;
    const limit = parseInt(limitInput.value, 10) || 10;
    scrapedData = [];
    log(`Navigating to search page for: ${keywords}`);
    setScrapingState(true);

    const tabId = tab.id;
    const listener = (changedTabId: number, changeInfo: any) => {
      if (changedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        log(`Page loaded. Starting scrape. Limit: ${limit}`);
        
        const sendMessageWithRetry = (retries: number) => {
          chrome.tabs.sendMessage(tabId, { action: "START_SCRAPING", limit }, (response) => {
            if (chrome.runtime.lastError) {
              if (retries > 0) {
                log(`Retrying to connect... (${retries} left)`);
                setTimeout(() => sendMessageWithRetry(retries - 1), 2000);
              } else {
                log(`Error starting scrape: ${chrome.runtime.lastError.message}`);
                setScrapingState(false);
              }
            } else {
              log("Scrape request received by page.");
            }
          });
        };
        
        setTimeout(() => sendMessageWithRetry(5), 2000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.update(tabId, { url: targetUrl });
  });

  stopBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      log("Sending stop signal...");
      chrome.tabs.sendMessage(tab.id, { action: "STOP_SCRAPING" });
    }
    setScrapingState(false);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "LOG") {
      log(message.payload);
    } else if (message.type === "SCRAPE_COMPLETE") {
      log("Scraping completed.");
      scrapedData = message.payload.data;
      log(`Total cards scraped: ${scrapedData.length}`);
      setScrapingState(false);
    } else if (message.type === "SCRAPE_STOPPED") {
      log("Scraping stopped by user.");
      scrapedData = message.payload.data;
      log(`Total cards scraped so far: ${scrapedData.length}`);
      setScrapingState(false);
    }
  });

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  exportJsonBtn.addEventListener("click", () => {
    if (scrapedData.length === 0) return;
    const content = JSON.stringify(scrapedData, null, 2);
    downloadFile(content, "linkedin_data.json", "application/json");
    log("Exported as JSON.");
  });

  exportCsvBtn.addEventListener("click", () => {
    if (scrapedData.length === 0) return;
    
    // Extract headers dynamically
    const headers = Array.from(new Set(scrapedData.flatMap(Object.keys)));
    
    const csvRows = [];
    csvRows.push(headers.join(",")); // Header row
    
    for (const row of scrapedData) {
      const values = headers.map(header => {
        const val = row[header];
        const escaped = ('' + (val || '')).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(","));
    }
    
    const content = csvRows.join("\n");
    downloadFile(content, "linkedin_data.csv", "text/csv");
    log("Exported as CSV.");
  });

  log("Popup initialized.");
});
