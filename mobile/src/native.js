import { Capacitor, CapacitorHttp, registerPlugin } from './preview-vendor/capacitor.js';
import { createNativeWorld } from './native-transport.js';

if (!Capacitor.isNativePlatform()) throw new Error('This package needs the native app');
const response = await fetch('/native-config.json');
if (!response.ok) throw new Error('Missing native configuration');
const { origin } = await response.json();
window.opencraftNative = createNativeWorld(origin, CapacitorHttp);

const App = registerPlugin('App');
await App.addListener('appStateChange', ({ isActive }) => {
  window.dispatchEvent(new CustomEvent('opencraft-app-state', { detail: isActive }));
});
if (Capacitor.getPlatform() === 'android') {
  await App.addListener('backButton', () => {
    const handled = !window.dispatchEvent(new Event('opencraft-back', { cancelable: true }));
    if (!handled) void App.minimizeApp();
  });
}
