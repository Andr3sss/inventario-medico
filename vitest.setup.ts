// IndexedDB no existe en Node. fake-indexeddb lo implementa en memoria para que
// las pruebas de la capa de datos corran sin navegador.
import 'fake-indexeddb/auto';
