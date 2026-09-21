/* ===========================================================================
   JobScout — the field's behaviour. Paste OR file, one component.

   Every state it can be in is written to `data-state` on the .field element,
   so the DOM is the source of truth and check_field_chrome.mjs can read it
   without knowing anything about this file.

       data-state="empty" | "typing" | "file" | "error"
       data-drag="1"      while a file is over the well

   No framework, no build step. Call enhanceFields() once; it is idempotent,
   so calling it again after inserting a field into the DOM is safe.
   =========================================================================== */

const ACCEPT = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'];
const MAX_BYTES = 8 * 1024 * 1024;   // 8 MB. A résumé is never bigger; a
                                     // rejected 40MB scan is a better outcome
                                     // than a silent five-minute upload.

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

export function enhanceFields(root = document) {
  root.querySelectorAll('.field').forEach(field => {
    if (field.dataset.enhanced === '1') return;
    field.dataset.enhanced = '1';

    const area   = field.querySelector('.field__area');
    const picker = field.querySelector('.field__file-input');
    const attach = field.querySelector('.field__attach');
    const chip   = field.querySelector('.field__chip');
    const name   = field.querySelector('.field__chip__name');
    const size   = field.querySelector('.field__chip__size');
    const remove = field.querySelector('.field__chip__x');
    const go     = field.querySelector('.field__go');
    const err    = field.querySelector('.field__err');

    const setState = s => { field.dataset.state = s; syncGo(); };

    function syncGo() {
      if (!go) return;
      const hasPaste = area && area.value.trim().length > 0;
      const hasFile  = field.dataset.state === 'file';
      go.disabled = !(hasPaste || hasFile);
    }

    function fail(msg) {
      if (err) err.textContent = msg;
      setState('error');
    }

    function accept(file) {
      if (!file) return;
      if (!ACCEPT.includes(extOf(file.name))) {
        // Says what to do, not what went wrong.
        fail('Attach a PDF, Word or text file — or paste the text instead.');
        return;
      }
      if (file.size > MAX_BYTES) {
        fail(`That file is ${fmtSize(file.size)}. Attach one under 8 MB, or paste the text instead.`);
        return;
      }
      if (name) name.textContent = file.name;
      if (size) size.textContent = fmtSize(file.size);
      field._file = file;
      setState('file');
    }

    /* --- the picker ---------------------------------------------------- */
    if (attach && picker) {
      attach.addEventListener('click', () => picker.click());
      picker.addEventListener('change', () => accept(picker.files && picker.files[0]));
    }

    /* --- clearing ------------------------------------------------------ */
    if (remove) {
      remove.addEventListener('click', () => {
        field._file = null;
        if (picker) picker.value = '';
        setState('empty');
        if (area) area.focus();
      });
    }

    /* --- typing -------------------------------------------------------- */
    if (area) {
      area.addEventListener('input', () => {
        if (field.dataset.state === 'file') return;
        setState(area.value.trim() ? 'typing' : 'empty');
      });
    }

    /* --- drag and drop, on the WHOLE well ------------------------------- */
    let depth = 0;   // dragenter/leave fire per child; count them or the
                     // highlight flickers as the pointer crosses the textarea
    field.addEventListener('dragenter', e => {
      e.preventDefault(); depth++; field.dataset.drag = '1';
    });
    field.addEventListener('dragover', e => { e.preventDefault(); });
    field.addEventListener('dragleave', e => {
      e.preventDefault(); depth = Math.max(0, depth - 1);
      if (depth === 0) delete field.dataset.drag;
    });
    field.addEventListener('drop', e => {
      e.preventDefault(); depth = 0; delete field.dataset.drag;
      const dt = e.dataTransfer;
      if (!dt) return;
      if (dt.files && dt.files.length) { accept(dt.files[0]); return; }
      // a drag of selected text is a paste, not an upload
      const text = dt.getData('text/plain');
      if (text && area) {
        area.value = text;
        setState('typing');
        area.focus();
      }
    });

    /* --- a pasted file (screenshot of a résumé, or a copied file) -------- */
    if (area) {
      area.addEventListener('paste', e => {
        const items = e.clipboardData && e.clipboardData.files;
        if (items && items.length) { e.preventDefault(); accept(items[0]); }
      });
    }

    setState(field.dataset.state || 'empty');
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhanceFields());
  } else {
    enhanceFields();
  }
}
