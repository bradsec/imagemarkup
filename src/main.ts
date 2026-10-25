import './styles/base.css';
import './styles/workspace.css';
import './styles/dialogs.css';
import './styles/responsive.css';
import { startApp } from './controller';

const app = document.querySelector<HTMLDivElement>('#app')!;
startApp(app);

function preventBrowserPinch(event: Event): void {
  if (event.cancelable) event.preventDefault();
}

// iOS Safari needs gesture events, while other mobile browsers expose multitouch events.
document.addEventListener('gesturestart', preventBrowserPinch, { passive: false });
document.addEventListener('gesturechange', preventBrowserPinch, { passive: false });
document.addEventListener('touchmove', (event) => {
  if (event.touches.length > 1) preventBrowserPinch(event);
}, { passive: false });
