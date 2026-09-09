import type { ReactElement } from 'react';
import { Avatar, Boton, EncabezadoPagina, Estado } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';

const LINEAS = [
  {
    codigo: 'CNS-001582',
    nombre: 'Sutura Vicryl 3-0',
    cantidad: 2,
    precio: '$8,58',
    total: '$17,16',
  },
  {
    codigo: 'CNS-001610',
    nombre: 'Tornillo cortical 3.5 mm',
    cantidad: 4,
    precio: '$25,85',
    total: '$103,40',
  },
  {
    codigo: 'INS-002381',
    nombre: 'Pinza Kelly curva 14 cm',
    cantidad: 1,
    precio: '$37,40',
    total: '$37,40',
  },
  {
    codigo: 'INS-002416',
    nombre: 'Separador Farabeuf par',
    cantidad: 1,
    precio: '$80,30',
    total: '$80,30',
  },
];

export function Facturacion(): ReactElement {
  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Cierre de operación"
        titulo="Prefactura FV-1084"
        descripcion="Revisa los instrumentos utilizados y confirma la institución antes de emitir."
        acciones={<Estado tono="aviso">Pendiente de revisión</Estado>}
      />
      <div className="factura-grid">
        <div className="factura-grid__principal">
          <section className="panel resumen-operacion">
            <header className="panel__cabecera">
              <div>
                <p className="sobrelinea">Operación vinculada</p>
                <h2>Osteosíntesis de radio</h2>
              </div>
              <button type="button" className="enlace-accion">
                Ver operación <Icono nombre="flechaDerecha" tamano={15} />
              </button>
            </header>
            <div className="resumen-operacion__datos">
              <span>
                <Icono nombre="maleta" />
                <small>Maleta</small>
                <strong>MQ-2048</strong>
              </span>
              <span>
                <Icono nombre="reloj" />
                <small>Finalizada</small>
                <strong>Hoy, 10:04</strong>
              </span>
              <span>
                <Avatar nombre="Marcia Loor" pequeno />
                <small>Instrumentista</small>
                <strong>Marcia Loor</strong>
              </span>
            </div>
          </section>
          <section className="panel factura-lineas">
            <header className="panel__cabecera">
              <div>
                <p className="sobrelinea">Detalle de uso</p>
                <h2>Instrumentos y productos</h2>
              </div>
              <span className="panel__nota">4 líneas · 8 unidades</span>
            </header>
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código / producto</th>
                    <th className="alinear-centro">Cantidad</th>
                    <th className="alinear-derecha">Precio unitario</th>
                    <th className="alinear-derecha">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {LINEAS.map((linea) => (
                    <tr key={linea.codigo}>
                      <td>
                        <span className="producto-celda">
                          <code>{linea.codigo}</code>
                          <strong>{linea.nombre}</strong>
                        </span>
                      </td>
                      <td className="alinear-centro">
                        <span className="cantidad">{linea.cantidad}</span>
                      </td>
                      <td className="alinear-derecha numero">{linea.precio}</td>
                      <td className="alinear-derecha numero numero--fuerte">{linea.total}</td>
                      <td>
                        <button type="button" className="boton-icono boton-icono--sutil">
                          <Icono nombre="editar" tamano={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lista-movil">
              {LINEAS.map((linea) => (
                <div className="fila-movil" key={linea.codigo}>
                  <span className="fila-movil__principal">
                    <code>{linea.codigo}</code>
                    <strong>{linea.nombre}</strong>
                    <small>
                      {linea.cantidad} un. × {linea.precio}
                    </small>
                  </span>
                  <strong>{linea.total}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="panel nota-factura">
            <label>
              <span>
                Nota interna <small>Opcional</small>
              </span>
              <textarea placeholder="Agrega información relevante para contabilidad…" />
            </label>
          </section>
        </div>

        <aside className="panel resumen-factura">
          <header>
            <p className="sobrelinea">Resumen</p>
            <h2>Datos de facturación</h2>
          </header>
          <label className="campo-ui">
            <span>Institución</span>
            <div className="select-con-icono">
              <Icono nombre="hospital" />
              <select defaultValue="metro">
                <option value="metro">Hospital Metropolitano</option>
                <option>Clínica Millenium</option>
                <option>Hospital San Juan</option>
              </select>
              <Icono nombre="chevron" tamano={15} />
            </div>
          </label>
          <div className="institucion-dato">
            <span>
              <small>Ciudad</small>
              <strong>Quito</strong>
            </span>
            <span>
              <small>RUC</small>
              <strong>1790012345001</strong>
            </span>
          </div>
          <label className="campo-ui">
            <span>Nivel de precio</span>
            <div className="select-con-icono">
              <span className="nivel-precio">H</span>
              <select defaultValue="habitual">
                <option value="habitual">Precio habitual · +10%</option>
                <option>Precio provincia · +20%</option>
                <option>Nota de crédito · +30%</option>
              </select>
              <Icono nombre="chevron" tamano={15} />
            </div>
          </label>
          <div className="aviso-inline aviso-inline--info">
            <Icono nombre="alerta" />
            <p>El nivel habitual está configurado para esta institución.</p>
          </div>
          <div className="totales">
            <div>
              <span>Subtotal</span>
              <strong>$238,26</strong>
            </div>
            <div>
              <span>IVA 15%</span>
              <strong>$35,74</strong>
            </div>
            <div className="totales__total">
              <span>Total</span>
              <strong>$274,00</strong>
            </div>
          </div>
          <div className="resumen-factura__acciones">
            <Boton icono="check">Aprobar y emitir</Boton>
            <Boton variante="secundario">Guardar borrador</Boton>
          </div>
          <p className="resumen-factura__pie">
            <Icono nombre="check" tamano={14} />
            Todos los precios fueron validados
          </p>
        </aside>
      </div>
    </div>
  );
}
