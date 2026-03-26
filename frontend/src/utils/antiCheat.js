/**
 * antiCheat.js
 * Blocks text selection, right-click context menu, and copy shortcuts
 * to discourage students from searching answers externally.
 */

export function enableAntiCheat() {
  // Block right-click context menu
  const handleContextMenu = (e) => {
    e.preventDefault();
    return false;
  };

  // Block copy shortcuts (Ctrl+C, Ctrl+A, Ctrl+U, Ctrl+S)
  const handleKeyDown = (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      ['c', 'a', 'u', 's', 'p'].includes(e.key.toLowerCase())
    ) {
      e.preventDefault();
      return false;
    }
    // Block F12 (DevTools)
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
    // Block Ctrl+Shift+I (DevTools)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      return false;
    }
  };

  // Block text selection via CSS
  const style = document.createElement('style');
  style.id = 'anti-cheat-styles';
  style.textContent = `
    .anti-cheat-active {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add('anti-cheat-active');

  document.addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('keydown', handleKeyDown);

  // Block drag events
  const handleDrag = (e) => e.preventDefault();
  document.addEventListener('dragstart', handleDrag);

  // Return cleanup function
  return () => {
    document.removeEventListener('contextmenu', handleContextMenu);
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('dragstart', handleDrag);
    document.body.classList.remove('anti-cheat-active');
    const styleEl = document.getElementById('anti-cheat-styles');
    if (styleEl) styleEl.remove();
  };
}
