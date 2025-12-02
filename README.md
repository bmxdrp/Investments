# 🧘 Capyte - Control de Inversiones con Calma y Solidez

> *"La tranquilidad de un capibara, la solidez de la tecnología"*

Sistema completo de gestión de inversiones personales con soporte multi-moneda (COP/USD), verificación de email, recuperación de contraseña y análisis avanzado.

![Status](https://img.shields.io/badge/status-activo-success)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🌟 Características Principales

### ✅ Sistema de Autenticación Completo
- 🔐 **Registro seguro** con verificación de email (Nodemailer)
- 📧 **Recuperación de contraseña** vía email
- 🔒 **Sesiones seguras** con Argon2
- ✉️ **Emails transaccionales** con plantillas HTML personalizadas
- 🛡️ **Row Level Security (RLS)** en PostgreSQL

### 💼 Gestión de Inversiones
- 📊 **Dashboard interactivo** con métricas en tiempo real
- � **Gestión de cuentas** con soporte para subcuentas jerárquicas
- 💵 **Multi-moneda** (COP y USD) con tasas de cambio automáticas
- 📈 **Transferencias** entre cuentas con conversión automática
- 💸 **Aportes y retiros** con validación de fondos
- � **Historial completo** de transacciones

### 📊 Análisis y Visualización
- 📉 **Estadísticas avanzadas** (ROI, volatilidad, rendimiento)
- 📈 **Gráficos dinámicos** con Chart.js
- 🔍 **Auditoría completa** de todas las operaciones
- � **Diseño responsive** optimizado para mobile y desktop

### 🎨 Diseño Premium
- 🌙 **Tema oscuro** con paleta Stone/Amber/Teal
- ✨ **Glassmorphism** y animaciones sutiles
- 🧘 **UX zen** inspirado en la calma del capibara
- 🎯 **SEO optimizado** con meta tags completos

---

## 🛠️ Stack Tecnológico

### Frontend
- **Framework:** Astro 5.15.9
- **Estilos:** TailwindCSS 4.1.17
- **Gráficos:** Chart.js 4.5.1
- **Iconos:** Heroicons (SVG)

### Backend
- **Runtime:** Astro API Routes (Serverless)
- **Database:** Neon PostgreSQL (Serverless)
- **ORM:** Neon Serverless Driver
- **Auth:** Sesiones con Argon2
- **Email:** Nodemailer

### DevOps & Tools
- **Deploy:** Vercel
- **Package Manager:** pnpm
- **Testing:** Jest
- **Linting:** TypeScript ESLint

---

## 📦 Instalación Rápida

### Prerrequisitos
- Node.js 18+
- pnpm (recomendado) o npm
- Cuenta en [Neon Database](https://neon.tech)
- Servidor SMTP (Gmail, SendGrid, Mailtrap, etc.)

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/tu-usuario/capyte.git
cd capyte
```

2. **Instalar dependencias**
```bash
pnpm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:
```env
# Database
DATABASE_URL=postgresql://user:password@host/database

# SMTP (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-contraseña-de-aplicacion

# Currency API (opcional)
CURRENCY_API_KEY=tu_api_key_de_currencyapi_net
```

4. **Configurar base de datos**
```bash
# Las tablas se crean automáticamente al ejecutar la app
# O ejecuta manualmente el schema en Neon Console
```

5. **Iniciar servidor de desarrollo**
```bash
pnpm dev
```

6. **Abrir en navegador**
```
http://localhost:4321
```

---

## 📚 Estructura del Proyecto

```
capyte/
├── src/
│   ├── components/          # Componentes reutilizables
│   │   ├── admin/          # Componentes del admin
│   │   └── dashboard/      # Componentes del dashboard
│   ├── layouts/            # Layouts de página
│   │   ├── home.astro      # Layout landing (con SEO)
│   │   ├── default.astro   # Layout dashboard
│   │   ├── admin.astro     # Layout admin
│   │   └── error.astro     # Layout errores
│   ├── lib/                # Lógica de negocio
│   │   ├── db.ts          # Conexión DB + RLS
│   │   ├── finance.ts     # Funciones financieras
│   │   └── audit.ts       # Sistema de auditoría
│   ├── middleware.ts       # Auth + protección de rutas
│   ├── pages/             # Rutas y páginas
│   │   ├── index.astro    # Landing page
│   │   ├── auth/          # Login/registro/recovery
│   │   ├── dashboard/     # Panel usuario
│   │   ├── admin/         # Panel admin
│   │   └── api/           # API endpoints
│   └── styles/            # CSS global
├── public/                # Assets estáticos
│   ├── logo.png          # Logo capibara
│   └── robots.txt        # SEO
└── docs/                 # Documentación
```

---

## 🔧 Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Servidor de desarrollo (puerto 4321) |
| `pnpm build` | Build para producción |
| `pnpm preview` | Preview del build |
| `pnpm test` | Ejecutar tests con Jest |
| `pnpm test:watch` | Tests en modo watch |

---

## � Características Detalladas

### 🔐 Sistema de Autenticación

#### Registro con Verificación de Email
1. Usuario se registra con email y contraseña
2. Sistema envía email de verificación con token único
3. Usuario hace clic en el enlace (válido 24h)
4. Cuenta se activa automáticamente
5. Usuario puede iniciar sesión

#### Recuperación de Contraseña
1. Usuario solicita recuperación desde `/auth/forgot-password`
2. Sistema envía email con enlace de recuperación
3. Usuario ingresa nueva contraseña
4. Token se marca como usado
5. Usuario puede iniciar sesión con nueva contraseña

### � Gestión de Transacciones

#### Sistema Unificado
- **Tabla única:** `transactions` para todos los movimientos
- **Tipos soportados:**
  - `initial_balance` - Saldo inicial
  - `contribution` - Aporte
  - `withdrawal` - Retiro
  - `transf_in` / `transf_out` - Transferencias
  - `fee` - Comisiones
  - `adjustment` - Ajustes manuales

#### Conversión Automática
- Transferencias entre monedas diferentes
- Tasa de cambio guardada en cada transacción
- Cálculos precisos con 2 decimales

### 📊 Dashboard y Análisis

#### Métricas Disponibles
- **Valor total del portafolio** (en COP)
- **Total invertido** vs **Total retirado**
- **Retorno neto** y **ROI %**
- **Volatilidad** (desviación estándar)
- **Mejor/Peor mes** de rendimiento

#### Gráficos Generados
- Historial de valores
- Rentabilidad acumulada
- Rendimiento % diario
- Aportes vs Retiros
- Distribución por moneda
- Comparativa COP/USD

---

## 🔌 API Endpoints

### Autenticación
```
POST   /api/auth/register         # Registro + email verificación
POST   /api/auth/login            # Login (requiere email verificado)
GET    /api/auth/logout           # Logout
POST   /api/auth/forgot-password  # Solicitar recuperación
POST   /api/auth/reset-password   # Restablecer contraseña
GET    /api/auth/verify-email     # Verificar email
```

### Transacciones
```
POST   /api/transactions/contribute  # Registrar aporte
POST   /api/transactions/withdraw    # Registrar retiro
POST   /api/transactions/transfer    # Transferir entre cuentas
```

### Cuentas
```
GET    /api/accounts              # Listar cuentas
POST   /api/accounts              # Crear cuenta
DELETE /api/accounts/[id]         # Eliminar cuenta
```

### Datos
```
GET    /api/graphics              # Gráficos dinámicos
GET    /api/cron/update-rate      # Actualizar tasa de cambio
```

### SEO
```
GET    /sitemap.xml              # Sitemap dinámico
GET    /robots.txt               # Control de crawlers
```

---

## 🗄️ Base de Datos

### Tablas Principales

#### `users`
- Usuarios del sistema
- Campos: `id`, `email`, `password_hash`, `email_verified_at`, `role`

#### `sessions`
- Sesiones activas
- Expiración automática (30 minutos)

#### `accounts`
- Cuentas de inversión
- Soporte para jerarquías (parent_id)
- Monedas: COP, USD

#### `transactions`
- **Tabla unificada** para todos los movimientos
- Campos clave: `type`, `amount`, `currency`, `new_value`, `usd_to_cop_rate`

#### `exchange_rates`
- Tasas de cambio históricas USD/COP
- Actualización automática vía cron

#### `password_resets`
- Tokens de recuperación de contraseña
- Expiración: 1 hora

#### `email_verifications`
- Tokens de verificación de email
- Expiración: 24 horas

### Vistas y Funciones
- `cash_flows` - Vista de flujos de efectivo
- `account_balances` - Vista de balances
- `create_transfer()` - Función para transferencias
- `adjust_account_value()` - Función para ajustes

---

## 🎨 Diseño y UX

### Paleta de Colores
- **Stone** (950-50): Base oscura, calma
- **Amber** (600-400): Acentos cálidos, confianza
- **Teal** (500-400): Toques de serenidad

### Principios de Diseño
1. **Calma visual** - Sin elementos distractores
2. **Glassmorphism** - Transparencias y blur
3. **Animaciones sutiles** - Transiciones suaves
4. **Responsive first** - Mobile y desktop

### Componentes Clave
- Sidebars con logo capibara
- Cards con glassmorphism
- Botones con gradientes amber
- Inputs con focus rings amber
- Mensajes de error/éxito temáticos

---

## 🔒 Seguridad

### Implementado
✅ Argon2 para hashing de contraseñas  
✅ Row Level Security (RLS) en PostgreSQL  
✅ Validación de entrada con Zod  
✅ Sesiones con expiración automática  
✅ Tokens únicos (UUID) para recuperación  
✅ CSRF protection en formularios  
✅ HttpOnly cookies  
✅ Middleware de autenticación  

### Mejores Prácticas
- Nunca exponer API keys en el código
- Validar todos los inputs del usuario
- Usar prepared statements (SQL injection protection)
- Limitar intentos de login (rate limiting)
- Logs de auditoría para acciones críticas

---

## 📈 SEO y Performance

### SEO Implementado
✅ Meta tags completos (title, description, keywords)  
✅ Open Graph para redes sociales  
✅ Twitter Cards  
✅ Structured Data (JSON-LD)  
✅ Sitemap.xml dinámico  
✅ Robots.txt configurado  
✅ Canonical URLs  
✅ Favicon y Apple Touch Icon  

### Performance
- Serverless functions (Vercel Edge)
- PostgreSQL con índices optimizados
- Lazy loading de imágenes
- CSS minificado con TailwindCSS
- Astro Islands para JS mínimo

---

## 🚀 Deploy en Vercel

1. **Conectar repositorio**
```bash
vercel
```

2. **Configurar variables de entorno**
- Agregar todas las variables del `.env` en Vercel Dashboard

3. **Deploy automático**
- Push a `main` → Deploy automático
- Preview deployments en PRs

4. **Configurar dominio**
- Agregar dominio custom en Vercel
- Actualizar `robots.txt` con el dominio final

---

## 🧪 Testing

```bash
# Ejecutar todos los tests
pnpm test

# Tests en modo watch
pnpm test:watch

# Coverage
pnpm test --coverage
```

### Estructura de Tests
```
tests/
├── unit/           # Tests unitarios
├── integration/    # Tests de integración
└── e2e/           # Tests end-to-end
```

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor:

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

### Guidelines
- Seguir convenciones de código existentes
- Agregar tests para nuevas features
- Actualizar documentación
- Mantener commits atómicos y descriptivos

---

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

---

## 👤 Autor

**Capyte Team**
- Website: [capyte.afroletra.com](https://capyte.afroletra.com)
- Email: soporte@capyte.com

---

## 🙏 Agradecimientos

- [Astro](https://astro.build) - Framework web moderno
- [Neon](https://neon.tech) - PostgreSQL serverless
- [Vercel](https://vercel.com) - Hosting y deploy
- [TailwindCSS](https://tailwindcss.com) - Utility-first CSS
- [Chart.js](https://www.chartjs.org) - Gráficos interactivos
- [Nodemailer](https://nodemailer.com) - Email transaccional

---

## 📞 Soporte

¿Necesitas ayuda?

- 📖 Lee la documentación completa
- 🐛 Reporta bugs en [Issues](https://github.com/tu-usuario/capyte/issues)
- 💬 Contáctanos en soporte@capyte.com

---

## ⭐ Dale una estrella

Si este proyecto te fue útil, ¡dale una estrella en GitHub! ⭐

---

## 🗺️ Roadmap Futuro

### Próximas Features
- [ ] Integración con bancos (Plaid/Belvo)
- [ ] App móvil (PWA)
- [ ] Exportación a Excel/PDF
- [ ] Notificaciones push
- [ ] Dashboard compartido (multi-usuario)
- [ ] API pública REST
- [ ] Integración con Stripe
- [ ] Análisis con IA/ML
- [ ] Modo offline

---

**Hecho con 🧘 calma y ☕ café**

*"Inversiones sólidas, mente en calma"*
