(function () {
  "use strict";

  // --- UI Setup ---

  const btn = document.createElement("button");
  btn.id = "ssld-download-btn";
  btn.textContent = "Download All Lyrics";
  document.body.appendChild(btn);

  let overlay = null;
  let statusEl = null;
  let progressBar = null;
  let progressText = null;
  let logEl = null;
  let closeBtn = null;

  function showOverlay() {
    overlay = document.createElement("div");
    overlay.id = "ssld-overlay";
    overlay.innerHTML = `
      <div id="ssld-modal">
        <h2>Downloading Lyrics</h2>
        <p id="ssld-status">Preparing...</p>
        <div id="ssld-progress-bar-container"><div id="ssld-progress-bar"></div></div>
        <p id="ssld-progress-text">0 / 0</p>
        <div id="ssld-log"></div>
        <button id="ssld-close-btn">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);

    statusEl = document.getElementById("ssld-status");
    progressBar = document.getElementById("ssld-progress-bar");
    progressText = document.getElementById("ssld-progress-text");
    logEl = document.getElementById("ssld-log");
    closeBtn = document.getElementById("ssld-close-btn");

    closeBtn.addEventListener("click", () => {
      overlay.remove();
      overlay = null;
      btn.disabled = false;
    });
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setProgress(current, total) {
    if (progressBar) progressBar.style.width = `${(current / total) * 100}%`;
    if (progressText) progressText.textContent = `${current} / ${total}`;
  }

  function log(message, cls) {
    if (!logEl) return;
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = message;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showClose() {
    if (closeBtn) closeBtn.style.display = "inline-block";
  }

  // --- Helpers ---

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for the song list table to update after an AJAX action.
   */
  function waitForTableUpdate(timeout = 15000) {
    return new Promise((resolve) => {
      const target =
        document.querySelector(".song-list-table") ||
        document.querySelector(".search-results");
      if (!target) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, timeout);

      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        observer.disconnect();
        setTimeout(resolve, 300);
      });

      observer.observe(target, { childList: true, subtree: true });
    });
  }

  // --- Song Collection ---

  function scrapeSongsFromPage() {
    const songs = [];
    const items = document.querySelectorAll("a.song-item");
    for (const item of items) {
      const titleEl = item.querySelector(".title");
      const title = titleEl ? titleEl.textContent.trim() : "Unknown Title";

      const href = item.getAttribute("href");
      const lyricsLink = item.querySelector('a.product-target[title="Has Lyrics"]');

      let lyricsUrl = null;
      if (lyricsLink) {
        lyricsUrl = lyricsLink.getAttribute("href");
      } else if (href) {
        lyricsUrl = href.replace(/\/$/, "") + "/viewlyrics";
      }

      songs.push({
        title,
        lyricsUrl,
        hasLyricsLink: !!lyricsLink,
      });
    }
    return songs;
  }

  function parseTotalItems() {
    const el = document.querySelector(".pagination-status");
    if (!el) return null;
    const match = el.textContent.match(/of\s+([\d,]+)\s+items?/i);
    if (match) return parseInt(match[1].replace(/,/g, ""), 10);
    return null;
  }

  async function collectAllSongs() {
    const perPageSelect = document.getElementById("SearchResultsNumPerPageSelect");
    let originalPerPage = null;

    if (perPageSelect) {
      originalPerPage = perPageSelect.value;
      if (perPageSelect.value !== "100") {
        setStatus("Setting page size to 100...");
        perPageSelect.value = "100";
        perPageSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForTableUpdate();
        await sleep(500);
      }
    }

    const totalItems = parseTotalItems();
    setStatus(
      totalItems
        ? `Found ${totalItems} songs. Collecting...`
        : "Collecting songs from page..."
    );

    const allSongs = [];
    let pageNum = 1;

    while (true) {
      setStatus(
        `Scraping page ${pageNum}...` +
          (totalItems ? ` (${allSongs.length} / ${totalItems} collected)` : "")
      );

      const pageSongs = scrapeSongsFromPage();
      allSongs.push(...pageSongs);

      const nextBtn = document.getElementById("SearchResultsPaginationNextPageButton");
      if (!nextBtn || nextBtn.disabled || nextBtn.classList.contains("disabled")) {
        break;
      }

      nextBtn.click();
      await waitForTableUpdate();
      await sleep(500);
      pageNum++;
    }

    if (perPageSelect && originalPerPage && perPageSelect.value !== originalPerPage) {
      perPageSelect.value = originalPerPage;
      perPageSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return allSongs;
  }

  // --- Folder Scanning for Deduplication ---

  /**
   * Prompt the user to pick the folder where lyrics are/will be saved.
   * Returns a Set of lowercase filenames (without extension) found in that folder,
   * or null if the user cancels.
   */
  async function scanExistingFiles() {
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: "read" });
    } catch (e) {
      if (e.name === "AbortError") return null;
      throw e;
    }

    const existing = new Set();
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === "file" && name.toLowerCase().endsWith(".txt")) {
        // Store the filename without extension, lowercased
        existing.add(name.toLowerCase().replace(/\.txt$/, ""));
      }
    }
    return existing;
  }

  /**
   * Check if a song title matches any existing file.
   * SongSelect names downloads like "Above All-lyrics.txt",
   * so we check if any existing file starts with the song title.
   */
  function songAlreadyExists(title, existingFiles) {
    const normalizedTitle = title.toLowerCase().trim();
    for (const filename of existingFiles) {
      if (filename === normalizedTitle || filename.startsWith(normalizedTitle)) {
        return true;
      }
    }
    return false;
  }

  // --- Lyrics Download via iframe ---

  /**
   * Load the viewlyrics page in a hidden iframe. The lyrics-content.js script
   * clicks Export → Download, letting the browser handle the download normally.
   * We just wait for confirmation that the click happened.
   */
  function triggerLyricsDownload(song) {
    const lyricsPageUrl = new URL(song.lyricsUrl, window.location.origin).href;

    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:none;pointer-events:none;";

      let done = false;

      const timeoutId = setTimeout(() => {
        if (done) return;
        finish(false, "Timeout (30s)");
      }, 30000);

      function finish(success, error) {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        window.removeEventListener("message", onMessage);
        iframe.remove();
        resolve({ success, error });
      }

      function onMessage(event) {
        if (done) return;
        if (event.source !== iframe.contentWindow) return;
        if (!event.data || event.data.type !== "SSLD_LYRICS_RESULT") return;
        finish(event.data.success, event.data.error);
      }

      window.addEventListener("message", onMessage);
      document.body.appendChild(iframe);
      iframe.src = lyricsPageUrl;
    });
  }

  // --- Main Download Flow ---

  async function downloadAll() {
    btn.disabled = true;
    showOverlay();

    try {
      setStatus("Collecting songs from all pages...");
      const songs = await collectAllSongs();

      if (songs.length === 0) {
        setStatus("No songs found on the page.");
        showClose();
        return;
      }

      log(`Found ${songs.length} songs total.`, "ssld-success");

      const withLyrics = songs.filter((s) => s.hasLyricsLink);
      const withoutLyrics = songs.filter((s) => !s.hasLyricsLink);

      if (withoutLyrics.length > 0) {
        log(
          `${withoutLyrics.length} song(s) have no lyrics link and will be skipped.`,
          "ssld-skip"
        );
      }

      if (withLyrics.length === 0) {
        setStatus("No songs with lyrics found.");
        showClose();
        return;
      }

      // Scan existing folder to skip already-downloaded songs
      setStatus("Select the folder where your lyrics are saved (for dedup)...");
      const existingFiles = await scanExistingFiles();

      if (existingFiles === null) {
        setStatus("Folder selection cancelled.");
        log("Download cancelled by user.", "ssld-error");
        showClose();
        return;
      }

      // Filter out songs that already exist
      const toDownload = [];
      let skipped = 0;
      for (const song of withLyrics) {
        if (songAlreadyExists(song.title, existingFiles)) {
          skipped++;
          log(`Already exists, skipped: ${song.title}`, "ssld-skip");
        } else {
          toDownload.push(song);
        }
      }

      if (skipped > 0) {
        log(`${skipped} song(s) already in folder, skipped.`, "ssld-skip");
      }

      if (toDownload.length === 0) {
        setStatus("All songs already downloaded!");
        log("Nothing new to download.", "ssld-success");
        showClose();
        return;
      }

      const total = toDownload.length;
      let completed = 0;
      let failed = 0;

      setProgress(0, total);
      setStatus(`Downloading lyrics (0 / ${total})...`);

      for (const song of toDownload) {
        const result = await triggerLyricsDownload(song);

        if (result.success) {
          completed++;
          log(`Downloaded: ${song.title}`, "ssld-success");
        } else {
          // Retry once
          await sleep(2000);
          const retry = await triggerLyricsDownload(song);
          if (retry.success) {
            completed++;
            log(`Downloaded (retry): ${song.title}`, "ssld-success");
          } else {
            failed++;
            log(`Failed: ${song.title} — ${retry.error || "unknown error"}`, "ssld-error");
          }
        }

        setProgress(completed + failed, total);
        setStatus(`Downloading lyrics (${completed + failed} / ${total})...`);

        // Delay between downloads to avoid rate limiting
        await sleep(1000);
      }

      // Done
      setStatus("Complete!");
      log("", null);
      const parts = [`${completed} downloaded`];
      if (skipped > 0) parts.push(`${skipped} already existed`);
      if (failed > 0) parts.push(`${failed} failed`);
      if (withoutLyrics.length > 0) parts.push(`${withoutLyrics.length} no lyrics`);
      log(
        `Done! ${parts.join(", ")}.`,
        failed === 0 ? "ssld-success" : "ssld-error"
      );
      showClose();
    } catch (err) {
      setStatus("An error occurred.");
      log(`Error: ${err.message}`, "ssld-error");
      showClose();
    }
  }

  btn.addEventListener("click", downloadAll);
})();
