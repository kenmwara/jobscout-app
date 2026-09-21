/* blocked.js — opens the résumé field in place, and moves focus to it.
   Focus is the whole point: a button that reveals a field and leaves the
   cursor behind has only moved the problem. */
export function mountUnblock(root = document) {
  root.querySelectorAll('.btn--unblock').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-blocked]');
      if (!card) return;
      card.dataset.open = '1';
      card.querySelector('.hero__input')?.focus({ preventScroll: false });
    });
  });
}
if (typeof document !== 'undefined') mountUnblock();
