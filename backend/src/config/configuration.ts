import { loadAppConfig } from './app-config';

export default () => {
  const config = loadAppConfig();

  return {
    app: config.app,
    database: config.database,
    jwt: config.jwt,
    security: config.security,
    rateLimit: config.rateLimit,
    google: config.google,
    mail: config.mail,
  };
};
