# 💰 Investment Tracker

Sistema completo de gestión de inversiones personales con soporte multi-moneda (COP/USD), análisis avanzado y visualización de datos.

![Status](https://img.shields.io/badge/status-en%20desarrollo-yellow)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🚀 Características

### ✅ Implementadas
- 🔐 **Autenticación segura** con sesiones y Argon2
- 📊 **Dashboard interactivo** con métricas en tiempo real
- 💼 **Gestión de cuentas** con soporte para subcuentas jerárquicas
- 💵 **Multi-moneda** (COP y USD) con tasas de cambio históricas
- 📈 **Gráficos avanzados** con Chart.js
- 📉 **Análisis estadístico** (ROI, volatilidad, Sharpe ratio, max drawdown)
- 🔍 **Auditoría completa** de todas las transacciones
- 📅 **Historial detallado** de movimientos por mes
- 🌐 **Responsive design** optimizado para mobile

### 🚧 En Desarrollo
- ⚠️ Reparación de endpoints críticos
- 🔄 Migración a sistema unificado de transacciones
- 💳 Integración con Stripe para suscripciones
- 🔌 API pública REST documentada

---

## 🛠️ Stack Tecnológico

- **Frontend:** Astro 5.15.9 + TailwindCSS 4.1.17
- **Backend:** Astro API Routes (Serverless)
- **Database:** Neon PostgreSQL (Serverless)
- **Auth:** Sesiones con Argon2
- **Charts:** Chart.js 4.5.1
- **Deploy:** Vercel

---

## 📦 Instalación

### Prerrequisitos
- Node.js 18+ 
- npm o pnpm
- Cuenta en Neon Database

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/tu-usuario/investment-tracker.git
cd investment-tracker
```

2. **Instalar dependencias**
```bash
npm install
# o
pnpm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:
```env
DATABASE_URL=postgresql://user:password@host/database
CURRENCY_API_KEY=tu_api_key_de_currencyapi_net
```

4. **Ejecutar migraciones de base de datos**
```bash
# Ver estructura en: docs/database-schema.sql
# Ejecutar manualmente en Neon Console
```

5. **Iniciar servidor de desarrollo**
```bash
npm run dev
```

6. **Abrir en navegador**
```
http://localhost:4321
```

---

## 📚 Documentación

### Archivos de Documentación
- **[INFORME_PROYECTO.md](./INFORME_PROYECTO.md)** - Análisis completo del proyecto
- **[ARQUITECTURA.md](./ARQUITECTURA.md)** - Diagrama de arquitectura
- **[PLAN_REPARACION.md](./PLAN_REPARACION.md)** - Código para reparar funcionalidades
- **[CHECKLIST.md](./CHECKLIST.md)** - Lista de tareas pendientes
- **[RESUMEN_EJECUTIVO.md](./RESUMEN_EJECUTIVO.md)** - Resumen para decisores

### Estructura del Proyecto
```
investment-tracker/
├── src/
│   ├── components/       # Componentes reutilizables
│   ├── layouts/          # Layouts de página
│   ├── lib/              # Lógica de negocio
│   │   ├── db.ts         # Conexión a base de datos
│   │   ├── finance.ts    # Funciones financieras
│   │   └── audit.ts      # Sistema de auditoría
│   ├── middleware.ts     # Autenticación
│   ├── pages/            # Rutas y páginas
│   │   ├── admin/        # Dashboard y gestión
│   │   ├── api/          # API endpoints
│   │   └── auth/         # Login/registro
│   └── styles/           # CSS global
├── public/               # Assets estáticos
└── docs/                 # Documentación adicional
```

---

## 🔧 Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor de desarrollo |
| `npm run build` | Construye para producción |
| `npm run preview` | Preview de build de producción |
| `npm run astro` | CLI de Astro |

---

## 🚨 Estado Actual

### ⚠️ Problemas Conocidos

1. **Endpoints rotos:**
   - `/api/transactions/contribute` - Funciones faltantes
   - `/api/cron` - Funciones faltantes

2. **Seguridad:**
   - API key expuesta (debe moverse a `.env`)
   - Falta validación en algunos endpoints

3. **Performance:**
   - Queries N+1 en dashboard (lento con muchos datos)

**Ver [PLAN_REPARACION.md](./PLAN_REPARACION.md) para soluciones.**

---

## 📖 Uso

### 1. Registro e Inicio de Sesión
```
1. Ir a /auth/register
2. Crear cuenta con email y contraseña
3. Iniciar sesión en /auth/login
```

### 2. Crear Cuentas de Inversión
```
1. Ir a /admin/accounts
2. Click en "Nueva Cuenta"
3. Ingresar nombre, tipo y moneda
4. (Opcional) Crear subcuentas
```

### 3. Registrar Aportes
```
1. Ir a /admin/contribute
2. Seleccionar cuenta
3. Ingresar monto y fecha
4. Guardar
```

### 4. Ver Dashboard
```
1. Ir a /admin
2. Ver resumen de portafolio
3. Analizar retornos y distribución
```

---

## 🔌 API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario
- `GET /api/auth/logout` - Cerrar sesión

### Cuentas
- `GET /api/accounts` - Listar cuentas
- `POST /api/accounts` - Crear cuenta
- `DELETE /api/accounts/[id]` - Eliminar cuenta

### Transacciones
- `POST /api/transactions/contribute` - Registrar aporte ⚠️
- `POST /api/transactions/withdraw` - Registrar retiro
- `POST /api/transactions/exchange_rate` - Actualizar tasa

### Datos
- `GET /api/portfolio-history` - Historial de portafolio
- `GET /api/graphics/index` - Datos para gráficos
- `GET /api/cron` - Actualización diaria ⚠️

---

## 🗄️ Base de Datos

### Tablas Principales
- `users` - Usuarios del sistema
- `sessions` - Sesiones activas
- `accounts` - Cuentas de inversión
- `contributions` - Aportes realizados
- `withdrawals` - Retiros realizados
- `exchange_rates` - Tasas de cambio históricas
- `account_value_history` - Valores históricos de cuentas
- `transaction_audit` - Log de auditoría

### Vistas
- `accounts_balance` - Balances calculados de cuentas

---

## 🚀 Roadmap

### Fase 1: Estabilización (Completar esta semana)
- [x] Análisis completo del proyecto
- [x] Limpieza de archivos obsoletos
- [ ] Reparar funcionalidades rotas
- [ ] Mover API key a variables de entorno
- [ ] Añadir validación de datos

### Fase 2: Optimización (1-2 semanas)
- [ ] Eliminar queries N+1
- [ ] Implementar cache
- [ ] Añadir tests unitarios
- [ ] Mejorar manejo de errores

### Fase 3: SaaS MVP (1 mes)
- [ ] Integrar Stripe
- [ ] Crear planes de suscripción
- [ ] API pública v1
- [ ] Landing page de marketing

### Fase 4: Crecimiento (3+ meses)
- [ ] Integraciones bancarias
- [ ] Mobile app (PWA)
- [ ] Análisis con ML
- [ ] Marketplace de integraciones

---

## 🤝 Contribuir

Las contribuciones son bienvenidas! Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

---

## 👤 Autor

**Tu Nombre**
- GitHub: [@tu-usuario](https://github.com/tu-usuario)
- Email: tu@email.com

---

## 🙏 Agradecimientos

- [Astro](https://astro.build) - Framework web
- [Neon](https://neon.tech) - Base de datos serverless
- [Vercel](https://vercel.com) - Hosting
- [TailwindCSS](https://tailwindcss.com) - Estilos
- [Chart.js](https://www.chartjs.org) - Gráficos

---

## 📞 Soporte

¿Necesitas ayuda? 

- 📖 Lee la [documentación completa](./INFORME_PROYECTO.md)
- 🐛 Reporta bugs en [Issues](https://github.com/tu-usuario/investment-tracker/issues)
- 💬 Únete a nuestro [Discord](#) (próximamente)

---

## ⭐ Dale una estrella

Si este proyecto te fue útil, ¡dale una estrella en GitHub! ⭐

---

**Hecho con ❤️ y ☕**
