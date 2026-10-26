import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { t } from './i18n/index.js';

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

const started = application.start();

started.catch((error) => {
  console.error("God's Eye View initialization failed:", error);
  const loaderStatus = document.querySelector('#loading-screen .loader-status');
  loaderStatus.textContent = t('Error: {message}', {
    message: describeError(error),
  });
  loaderStatus.style.color = '#ff4444';
});

// D-Space (hackathon layer): mounted beside the app once it is running.
started
  .then(async (components) => {
    const { mountDSpace } = await import('./dspace/index.js');
    mountDSpace({ viewer: components.scene.viewer });
  })
  .catch((error) => console.error('D-Space failed to mount:', error));

export { application };
