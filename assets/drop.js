/* Drop boxes, on every admin page
   ------------------------------------------------------------
   Every file picker on an admin page becomes a box you can drop files
   on, or click to choose them as before. It watches the page, so a
   picker added later (a new client panel, a new tab) gets one too,
   without each picker having to ask for it.

   A drop is handed to the picker as if the files had been chosen in
   it, so whatever the picker already does with its files (shrinking,
   uploading in parts, saving) runs exactly the same.

   A picker that already has its own box (inside a .drop) or is marked
   data-nodrop is left alone.
   ------------------------------------------------------------ */

(function () {
  const done = new WeakSet();

  function upgrade(input) {
    if (done.has(input) || input.dataset.nodrop != null || input.closest(".drop, .dropzone")) return;
    done.add(input);

    // what is on screen now: the input itself, or the button-like label around it
    const label = input.closest("label");
    const shown = label && !label.querySelector("input:not([type=file]), select, textarea") ? label : input;
    if (!shown.parentNode) return;

    const pictures = /^image\/[^,]*$|^image\/\*$/.test(input.accept || "");
    const box = document.createElement("div");
    box.className = "dropzone";
    box.tabIndex = 0;
    box.setAttribute("role", "button");

    const title = document.createElement("b");
    const hint = document.createElement("span");
    hint.textContent = (input.multiple ? "Drop " + (pictures ? "pictures" : "files") : "Drop " + (pictures ? "a picture" : "a file"))
      + " here, or click to choose";
    box.append(title, hint);

    // the label's own words ("Add photos", "Replace") stay as the box's title
    const named = () => {
      const t = shown === label ? label.textContent.trim() : "";
      title.textContent = t;
      title.hidden = !t;
    };
    named();
    if (shown === label) new MutationObserver(named).observe(label, { childList: true, characterData: true, subtree: true });

    shown.parentNode.insertBefore(box, shown.nextSibling);
    shown.style.display = "none";
    // the picker keeps working even if its label is emptied later
    if (shown === label) box.appendChild(input);
    input.style.display = "none";

    box.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("over"); });
    box.addEventListener("dragleave", (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove("over"); });
    box.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.remove("over");
      if (input.disabled) return;
      let files = [...(e.dataTransfer && e.dataTransfer.files || [])];
      if (pictures) files = files.filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      if (!input.multiple) files = files.slice(0, 1);
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function scan(root) {
    if (!root.querySelectorAll) return;
    if (root.matches && root.matches("input[type=file]")) upgrade(root);
    for (const input of root.querySelectorAll("input[type=file]")) upgrade(input);
  }

  // inputs made with createElement get their type a line later, so look again after each change settles
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(document.body); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // a file dropped next to a box must not open in the tab and throw the page away
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => e.preventDefault());

  if (document.body) scan(document.body);
  else addEventListener("DOMContentLoaded", () => scan(document.body));
})();
