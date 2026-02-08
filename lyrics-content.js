(function () {
  "use strict";

  // Only activate when loaded inside an iframe (by our extension on the song list page)
  if (window.self === window.top) return;

  // --- Click Export → Download, then notify parent ---

  function waitForReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        startPolling();
      });
    } else {
      startPolling();
    }
  }

  function startPolling() {
    var attempts = 0;
    var maxAttempts = 40; // 40 * 500ms = 20 seconds
    var clickedExport = false;

    var poll = setInterval(function () {
      attempts++;

      if (attempts > maxAttempts) {
        clearInterval(poll);
        window.parent.postMessage(
          {
            type: "SSLD_LYRICS_RESULT",
            success: false,
            url: window.location.href,
            error: "Timeout: could not find Export button",
          },
          "*"
        );
        return;
      }

      if (!clickedExport) {
        // The Export button is identified by its Font Awesome icon: i.fa-arrow-up-from-bracket
        var exportIcon = document.querySelector("i.fa-arrow-up-from-bracket");
        var exportBtn = exportIcon ? exportIcon.closest("button") || exportIcon.parentElement : null;
        if (!exportBtn) return; // Page hasn't rendered yet

        exportBtn.click();
        clickedExport = true;
        clearInterval(poll); // Stop polling, we're in the click flow now

        // The dropdown menu is a <ul> appended to <body>.
        // The Download button has id="lyricsDownloadButton".
        // Give dropdown time to appear, then click Download.
        setTimeout(function () {
          var dlBtn = document.getElementById("lyricsDownloadButton");
          if (dlBtn) {
            dlBtn.click();
            // Give the download a moment to trigger, then report success
            setTimeout(function () {
              window.parent.postMessage(
                {
                  type: "SSLD_LYRICS_RESULT",
                  success: true,
                  url: window.location.href,
                },
                "*"
              );
            }, 1000);
          } else {
            window.parent.postMessage(
              {
                type: "SSLD_LYRICS_RESULT",
                success: false,
                url: window.location.href,
                error: "Could not find Download button in Export menu",
              },
              "*"
            );
          }
        }, 800);
      }
    }, 500);
  }

  waitForReady();
})();
