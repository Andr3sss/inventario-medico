import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/pantallas.css';
import { ProveedorApp } from './datos/contexto.js';
import { App } from './App.js';

const raiz = document.getElementById('raiz');
if (raiz === null) throw new Error('No se encontro el nodo raiz');

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorApp>
        <App />
      </ProveedorApp>
    </BrowserRouter>
  </StrictMode>,
);
