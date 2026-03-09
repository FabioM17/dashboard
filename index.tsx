import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Hide the static HTML content now that React is taking over
const staticInfo = document.getElementById('static-app-info');
if (staticInfo) {
  staticInfo.style.display = 'none';
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);