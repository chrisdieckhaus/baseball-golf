"use client";

import { useState } from "react";
import styles from "./ShareButton.module.css";

/** Phones and tablets get the native share sheet; desktops copy to the clipboard. */
function prefersShareSheet(): boolean {
  return (
    typeof navigator.share === "function" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: fall back to a hidden textarea.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * The share button for every game: the share sheet on phones, the clipboard on
 * desktops, and if the clipboard can't be reached, the text shown in a box to
 * copy by hand (never a blocking browser dialog).
 */
export default function ShareButton({
  getText,
  label,
  className,
}: {
  /** Built when the button is pressed, so it can use window.location. */
  getText: () => string;
  label: string;
  className: string;
}) {
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  async function share() {
    const text = getText();

    if (prefersShareSheet()) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user closed the sheet
        // otherwise fall through to copying
      }
    }

    if (await copyText(text)) {
      setCopied(true);
      setFallbackText(null);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setFallbackText(text);
    }
  }

  return (
    <>
      <button className={className} onClick={share}>
        {copied ? "Copied to clipboard ✓" : label}
      </button>
      {fallbackText && (
        <textarea
          className={styles.fallback}
          readOnly
          value={fallbackText}
          rows={fallbackText.split("\n").length}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          aria-label="Share text: copy it from here"
        />
      )}
    </>
  );
}
