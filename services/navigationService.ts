/**
 * Navigation utilities for the application
 */

/**
 * Navigate to the Privacy Policy page
 */
export const navigateToPrivacyPolicy = (): void => {
  window.history.pushState({}, 'Políticas de Privacidad', '/politicas-de-privacidad');
  window.dispatchEvent(new Event('popstate'));
};

/**
 * Navigate to a specific path
 * @param path - The path to navigate to (e.g., '/', '/dashboard', '/politicas-de-privacidad')
 */
export const navigateTo = (path: string): void => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('popstate'));
};

/**
 * Navigate back to the previous page
 */
export const navigateBack = (): void => {
  window.history.back();
};

/**
 * Navigate to home/root
 */
export const navigateToHome = (): void => {
  navigateTo('/');
};
