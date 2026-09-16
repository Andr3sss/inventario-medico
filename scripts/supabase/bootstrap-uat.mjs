import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
};

const url = required('SUPABASE_URL').replace(/\/+$/, '');
const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
const password = required('UAT_USER_PASSWORD');
if (new URL(url).pathname !== '/')
  throw new Error('SUPABASE_URL debe ser la URL base, sin /rest/v1');
if (
  password.length < 12 ||
  !/[A-Z]/.test(password) ||
  !/[a-z]/.test(password) ||
  !/\d/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
) {
  throw new Error('UAT_USER_PASSWORD debe tener 12 caracteres y las cuatro clases');
}

const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USERS = [
  { email: 'ana.admin.uat@crearcos.test', name: 'Ana Administradora UAT', role: 'ADMINISTRADOR' },
  { email: 'marcia.auxiliar.uat@crearcos.test', name: 'Marcia Auxiliar UAT', role: 'AUXILIAR' },
  { email: 'diego.auxiliar.uat@crearcos.test', name: 'Diego Auxiliar UAT', role: 'AUXILIAR' },
  {
    email: 'priscila.coordinadora.uat@crearcos.test',
    name: 'Priscila Coordinadora UAT',
    role: 'COORDINADORA',
  },
  { email: 'veronica.contable.uat@crearcos.test', name: 'Veronica Contable UAT', role: 'CONTABLE' },
  { email: 'luis.supervisor.uat@crearcos.test', name: 'Luis Supervisor UAT', role: 'SUPERVISOR' },
];

const HOSPITALS = [
  { code: 'HOSP-UAT-GYE', name: 'Hospital UAT Guayaquil', city: 'Guayaquil', level: 'HABITUAL' },
  { code: 'HOSP-UAT-CUE', name: 'Clinica UAT Cuenca', city: 'Cuenca', level: 'HABITUAL' },
  {
    code: 'HOSP-UAT-NC',
    name: 'Hospital UAT Nota de Credito',
    city: 'Guayaquil',
    level: 'NOTA_CREDITO',
  },
];

const PRODUCTS = [
  { sku: 'UAT-INST-100', name: 'Instrumental UAT costo 100', type: 'INSTRUMENTAL', cost: 10_000 },
  { sku: 'UAT-CONS-010', name: 'Consumible UAT costo 10', type: 'INSUMO', cost: 1_000 },
  { sku: 'UAT-KIT-A', name: 'Kit UAT principal', type: 'KIT', cost: 20_000 },
  { sku: 'UAT-COMP-A', name: 'Componente instrumental UAT', type: 'INSTRUMENTAL', cost: 3_000 },
  { sku: 'UAT-COMP-B', name: 'Componente consumible UAT', type: 'INSUMO', cost: 500 },
  {
    sku: 'UAT-EXCEP-050',
    name: 'Instrumental UAT precio excepcional',
    type: 'INSTRUMENTAL',
    cost: 5_000,
  },
];

const PIECES = [
  ...Array.from({ length: 8 }, (_, index) => ({
    code: `UAT-I-${String(index + 1).padStart(3, '0')}`,
    sku: 'UAT-INST-100',
    parent: null,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    code: `UAT-C-${String(index + 1).padStart(3, '0')}`,
    sku: 'UAT-CONS-010',
    parent: null,
  })),
  { code: 'UAT-KIT-001', sku: 'UAT-KIT-A', parent: null },
  { code: 'UAT-KA-001', sku: 'UAT-COMP-A', parent: 'UAT-KIT-001' },
  { code: 'UAT-KB-001', sku: 'UAT-COMP-B', parent: 'UAT-KIT-001' },
  { code: 'UAT-X-001', sku: 'UAT-EXCEP-050', parent: null },
  { code: 'UAT-X-002', sku: 'UAT-EXCEP-050', parent: null },
];

const fail = (label, error) => {
  if (error) throw new Error(`${label}: ${error.code ?? ''} ${error.message}`.trim());
};

const one = async (label, request) => {
  const { data, error } = await request;
  fail(label, error);
  return data;
};

const count = async (label, request) => {
  const response = await request;
  fail(label, response.error);
  return response.count;
};

const config = await one(
  'CONFIGURACION_NO_DISPONIBLE',
  client
    .from('configuracion_sistema')
    .select('ciclo_vida,reset_demo_habilitado,ciudad_base,lote_demo_activo_id')
    .single(),
);
if (
  config.ciclo_vida !== 'DEMO' ||
  config.reset_demo_habilitado !== true ||
  !config.lote_demo_activo_id
) {
  throw new Error('CARGA_UAT_RECHAZADA: el destino no es un entorno DEMO purgable');
}

const authPage = await one(
  'AUTH_NO_DISPONIBLE',
  client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
);
const authByEmail = new Map(
  authPage.users.flatMap((user) => (user.email ? [[user.email.toLowerCase(), user]] : [])),
);
const profiles = await one(
  'PERFILES_NO_DISPONIBLES',
  client.from('perfiles').select('id,nombre,rol,activo,origen'),
);
const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
const actor = profiles.find(
  (profile) => profile.rol === 'ADMINISTRADOR' && profile.activo && profile.origen === 'DEMO',
);
if (!actor) throw new Error('ADMIN_DEMO_ACTIVO_NO_ENCONTRADO');

const createdUsers = [];
for (const expected of USERS) {
  let user = authByEmail.get(expected.email);
  if (!user) {
    const created = await one(
      `CREAR_AUTH_${expected.email}`,
      client.auth.admin.createUser({
        email: expected.email,
        password,
        email_confirm: true,
        user_metadata: { nombre: expected.name, origen: 'UAT' },
      }),
    );
    if (!created.user) throw new Error(`AUTH_SIN_USUARIO_${expected.email}`);
    user = created.user;
    authByEmail.set(expected.email, user);
  } else {
    await one(
      `ACTUALIZAR_AUTH_${expected.email}`,
      client.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...user.user_metadata, nombre: expected.name, origen: 'UAT' },
      }),
    );
  }

  const profile = profilesById.get(user.id);
  if (!profile) {
    const provisioned = await one(
      `PROVISIONAR_${expected.email}`,
      client.rpc('provisionar_usuario_por_admin', {
        p_actor_id: actor.id,
        p_usuario_id: user.id,
        p_nombre: expected.name,
        p_rol: expected.role,
      }),
    );
    profilesById.set(user.id, provisioned);
  } else if (
    profile.nombre !== expected.name ||
    profile.rol !== expected.role ||
    profile.activo !== true
  ) {
    const updated = await one(
      `ACTUALIZAR_PERFIL_${expected.email}`,
      client.rpc('actualizar_perfil', {
        p_actor_id: actor.id,
        p_usuario_id: user.id,
        p_nombre: expected.name,
        p_rol: expected.role,
        p_activo: true,
      }),
    );
    profilesById.set(user.id, updated);
  }
  createdUsers.push({
    email: expected.email,
    name: expected.name,
    role: expected.role,
    id: user.id,
  });
}

for (const { email, name } of USERS.filter((user) => user.role === 'AUXILIAR')) {
  const user = authByEmail.get(email);
  if (!user) throw new Error(`AUXILIAR_AUTH_AUSENTE_${email}`);
  const code = `BOD-${name.split(' ')[0].toUpperCase()}-UAT`;
  const existing = await one(
    `BUSCAR_BODEGA_${code}`,
    client.from('bodegas').select('id,responsable_id,tipo').eq('codigo', code).maybeSingle(),
  );
  if (!existing) {
    await one(
      `CREAR_BODEGA_${code}`,
      client
        .from('bodegas')
        .insert({
          codigo: code,
          nombre: `Bodega personal ${name}`,
          tipo: 'INSTRUMENTISTA',
          responsable_id: user.id,
        })
        .select('id')
        .single(),
    );
  } else if (existing.responsable_id !== user.id || existing.tipo !== 'INSTRUMENTISTA') {
    throw new Error(`BODEGA_UAT_INCOHERENTE_${code}`);
  }
}

for (const expected of HOSPITALS) {
  const existing = await one(
    `BUSCAR_HOSPITAL_${expected.code}`,
    client
      .from('hospitales')
      .select('id,nombre,ciudad,nivel_precio,version')
      .eq('codigo', expected.code)
      .maybeSingle(),
  );
  if (!existing) {
    await one(
      `CREAR_HOSPITAL_${expected.code}`,
      client.rpc('guardar_hospital_central', {
        p_actor_id: actor.id,
        p_hospital_id: randomUUID(),
        p_codigo: expected.code,
        p_nombre: expected.name,
        p_ciudad: expected.city,
        p_nivel_precio: expected.level,
        p_version_esperada: null,
      }),
    );
  } else if (
    existing.nombre !== expected.name ||
    existing.ciudad !== expected.city ||
    existing.nivel_precio !== expected.level
  ) {
    await one(
      `ACTUALIZAR_HOSPITAL_${expected.code}`,
      client.rpc('guardar_hospital_central', {
        p_actor_id: actor.id,
        p_hospital_id: existing.id,
        p_codigo: expected.code,
        p_nombre: expected.name,
        p_ciudad: expected.city,
        p_nivel_precio: expected.level,
        p_version_esperada: existing.version,
      }),
    );
  }
}

const productsBySku = new Map();
for (const expected of PRODUCTS) {
  let existing = await one(
    `BUSCAR_PRODUCTO_${expected.sku}`,
    client
      .from('productos')
      .select('id,nombre,tipo,costo_base_centavos,activo')
      .eq('sku', expected.sku)
      .maybeSingle(),
  );
  if (!existing) {
    const response = await one(
      `CREAR_PRODUCTO_${expected.sku}`,
      client.rpc('crear_producto_central', {
        p_actor_id: actor.id,
        p_producto_id: randomUUID(),
        p_sku: expected.sku,
        p_nombre: expected.name,
        p_tipo: expected.type,
        p_costo_base_centavos: expected.cost,
      }),
    );
    existing = response.producto;
  }
  if (
    existing.nombre !== expected.name ||
    existing.tipo !== expected.type ||
    Number(existing.costo_base_centavos) !== expected.cost ||
    existing.activo !== true
  ) {
    throw new Error(`PRODUCTO_UAT_INCOHERENTE_${expected.sku}`);
  }
  productsBySku.set(expected.sku, existing);
}

const kitProduct = productsBySku.get('UAT-KIT-A');
for (const componentSku of ['UAT-COMP-A', 'UAT-COMP-B']) {
  const component = productsBySku.get(componentSku);
  await one(
    `COMPONENTE_CATALOGO_${componentSku}`,
    client.from('producto_componentes_kit').upsert(
      {
        kit_producto_id: kitProduct.id,
        componente_producto_id: component.id,
        cantidad: 1,
      },
      { onConflict: 'kit_producto_id,componente_producto_id' },
    ),
  );
}

let device = await one(
  'BUSCAR_DISPOSITIVO_UAT',
  client.from('dispositivos').select('id').eq('nombre', 'Carga UAT Codex').maybeSingle(),
);
const deviceId = device?.id ?? randomUUID();
device = await one(
  'REGISTRAR_DISPOSITIVO_UAT',
  client.rpc('registrar_dispositivo', {
    p_actor_id: actor.id,
    p_dispositivo_id: deviceId,
    p_nombre: 'Carga UAT Codex',
    p_plataforma: 'node-operator',
    p_clave_publica: '',
    p_valido_hasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    p_metadata: { origen: 'bootstrap-uat' },
  }),
);

for (const expected of PIECES) {
  const existing = await one(
    `BUSCAR_PIEZA_${expected.code}`,
    client.from('piezas').select('id').eq('codigo', expected.code).maybeSingle(),
  );
  if (!existing) {
    await one(
      `REGISTRAR_PIEZA_${expected.code}`,
      client.rpc('registrar_pieza_central', {
        p_actor_id: actor.id,
        p_dispositivo_id: device.id,
        p_pieza_id: randomUUID(),
        p_codigo: expected.code,
        p_sku: expected.sku,
        p_kit_padre_codigo: expected.parent,
      }),
    );
  }
}

const [uatProfiles, uatHospitals, uatProducts, uatPieces, uatWarehouses, openBags, invoices] =
  await Promise.all([
    one(
      'VERIFICAR_PERFILES',
      client
        .from('perfiles')
        .select('id,nombre,rol,activo')
        .in(
          'id',
          createdUsers.map((user) => user.id),
        ),
    ),
    one(
      'VERIFICAR_HOSPITALES',
      client.from('hospitales').select('codigo').like('codigo', 'HOSP-UAT-%'),
    ),
    one('VERIFICAR_PRODUCTOS', client.from('productos').select('sku').like('sku', 'UAT-%')),
    one('VERIFICAR_PIEZAS', client.from('piezas').select('codigo,estado').like('codigo', 'UAT-%')),
    one('VERIFICAR_BODEGAS', client.from('bodegas').select('codigo').like('codigo', 'BOD-%-UAT')),
    count('VERIFICAR_MALETAS', client.from('maletas').select('*', { count: 'exact', head: true })),
    count(
      'VERIFICAR_FACTURAS',
      client.from('facturas').select('*', { count: 'exact', head: true }),
    ),
  ]);

if (
  uatProfiles.length !== USERS.length ||
  uatHospitals.length !== HOSPITALS.length ||
  uatProducts.length !== PRODUCTS.length ||
  uatPieces.length !== PIECES.length ||
  uatWarehouses.length !== 2 ||
  uatPieces.some((piece) => piece.estado !== 'EN_BODEGA_CENTRAL')
) {
  throw new Error('VERIFICACION_UAT_INCOMPLETA');
}

process.stdout.write(
  `${JSON.stringify(
    {
      estado: 'UAT_CARGADO',
      ciclo: config.ciclo_vida,
      ciudadBase: config.ciudad_base,
      usuarios: createdUsers.map(({ email, name, role }) => ({ email, name, role })),
      hospitales: uatHospitals.length,
      productos: uatProducts.length,
      piezas: uatPieces.length,
      bodegasPersonales: uatWarehouses.length,
      maletasExistentes: openBags,
      facturasExistentes: invoices,
    },
    null,
    2,
  )}\n`,
);
