import type { ReactElement, SVGProps } from 'react';

export type NombreIcono =
  | 'inicio'
  | 'maleta'
  | 'cirugia'
  | 'inventario'
  | 'reprocesar'
  | 'conflicto'
  | 'factura'
  | 'usuarios'
  | 'buscar'
  | 'campana'
  | 'chevron'
  | 'mas'
  | 'filtros'
  | 'scanner'
  | 'check'
  | 'alerta'
  | 'cerrar'
  | 'flecha'
  | 'reloj'
  | 'ubicacion'
  | 'hospital'
  | 'caja'
  | 'descargar'
  | 'editar'
  | 'menu'
  | 'nube'
  | 'ojo'
  | 'flechaDerecha'
  | 'pausa'
  | 'wifi';

interface Propiedades extends SVGProps<SVGSVGElement> {
  readonly nombre: NombreIcono;
  readonly tamano?: number;
}

export function Icono({ nombre, tamano = 18, ...propiedades }: Propiedades): ReactElement {
  const contenido = (() => {
    switch (nombre) {
      case 'inicio':
        return (
          <>
            <path d="M3 10.8 12 3l9 7.8" />
            <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
          </>
        );
      case 'maleta':
        return (
          <>
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
          </>
        );
      case 'cirugia':
        return (
          <>
            <path d="M7 3v4M5 5h4M15 3v4M13 5h4" />
            <path d="M5 9h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
            <path d="M9 13h6M12 10v6" />
          </>
        );
      case 'inventario':
        return (
          <>
            <path d="m4 7 8-4 8 4-8 4Z" />
            <path d="M4 7v10l8 4 8-4V7M12 11v10" />
          </>
        );
      case 'reprocesar':
        return (
          <>
            <path d="M20 7h-5V2" />
            <path d="M20 7a9 9 0 1 0 1 8" />
            <path d="M8.5 12h7M12 8.5v7" />
          </>
        );
      case 'conflicto':
        return (
          <>
            <path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </>
        );
      case 'factura':
        return (
          <>
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
            <path d="M9 8h6M9 12h6M9 16h3" />
          </>
        );
      case 'usuarios':
        return (
          <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20a6 6 0 0 1 12 0M16 5.3a3 3 0 0 1 0 5.4M17 14a6 6 0 0 1 4 6" />
          </>
        );
      case 'buscar':
        return (
          <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </>
        );
      case 'campana':
        return (
          <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </>
        );
      case 'chevron':
        return <path d="m9 18 6-6-6-6" />;
      case 'mas':
        return <path d="M12 5v14M5 12h14" />;
      case 'filtros':
        return (
          <>
            <path d="M4 6h16M7 12h10M10 18h4" />
          </>
        );
      case 'scanner':
        return (
          <>
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
            <path d="M7 12h10M8 9v6M11 9v6M14 9v6M17 9v6" />
          </>
        );
      case 'check':
        return <path d="m5 12 4 4L19 6" />;
      case 'alerta':
        return (
          <>
            <path d="M12 9v4M12 17h.01" />
            <circle cx="12" cy="12" r="9" />
          </>
        );
      case 'cerrar':
        return <path d="m6 6 12 12M18 6 6 18" />;
      case 'flecha':
        return <path d="m12 19-7-7 7-7M5 12h14" />;
      case 'reloj':
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </>
        );
      case 'ubicacion':
        return (
          <>
            <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
            <circle cx="12" cy="10" r="2" />
          </>
        );
      case 'hospital':
        return (
          <>
            <path d="M4 21V5h10v16M14 10h6v11M8 9h2M8 13h2M8 17h2M17 14h.01M17 18h.01M2 21h20" />
          </>
        );
      case 'caja':
        return (
          <>
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M4 10h16M9 5v5M15 5v5" />
          </>
        );
      case 'descargar':
        return (
          <>
            <path d="M12 3v12m0 0 5-5m-5 5-5-5" />
            <path d="M5 21h14" />
          </>
        );
      case 'editar':
        return (
          <>
            <path d="M12 20h9" />
            <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
          </>
        );
      case 'menu':
        return <path d="M4 7h16M4 12h16M4 17h16" />;
      case 'nube':
        return <path d="M17.5 19H6a4 4 0 0 1-.5-8 7 7 0 0 1 13.3-2A5 5 0 0 1 17.5 19Z" />;
      case 'ojo':
        return (
          <>
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
            <circle cx="12" cy="12" r="2.5" />
          </>
        );
      case 'flechaDerecha':
        return <path d="M5 12h14m-5-5 5 5-5 5" />;
      case 'pausa':
        return (
          <>
            <path d="M9 5v14M15 5v14" />
          </>
        );
      case 'wifi':
        return (
          <>
            <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
            <path d="M12 20h.01" />
          </>
        );
    }
  })();

  return (
    <svg
      aria-hidden="true"
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...propiedades}
    >
      {contenido}
    </svg>
  );
}
