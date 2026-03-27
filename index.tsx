import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async'; // Import HelmetProvider
import App from './App';
import './styles/tailwind.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

// The application root, wrapped in HelmetProvider
const AppRoot = (
  <React.StrictMode>
    <BrowserRouter>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if (rootElement.hasChildNodes()) {
  // Use hydrateRoot for server-rendered (SSG) content
  ReactDOM.hydrateRoot(rootElement, AppRoot);
} else {
  // Use createRoot for standard client-side rendering (CSR)
  const root = ReactDOM.createRoot(rootElement);
  root.render(AppRoot);
}
