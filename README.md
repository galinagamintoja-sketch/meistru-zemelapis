# LocalPro.lt

Next.js + Supabase MVP for a Lithuanian tradespeople marketplace.

The first product stage is supply-side growth: register tradespeople, clean their details, approve profiles, and publish them on a map by trade, location, service radius, portfolio, and trust signals.

Current MVP includes:

- LocalPro.lt branding and public marketplace direction
- Leaflet/OpenStreetMap search map backed by `/api/specialists`
- tradesperson profile cards with contact details, service area, work photos, reviews, and trust labels
- tradesperson self-registration API at `/api/tradesperson/register`
- Google login page at `/login`
- admin approval dashboard at `/admin`
- CSV/imported lead API foundation at `/api/imported-leads`
- WhatsApp Business webhook foundation at `/api/whatsapp/webhook`
- Supabase/PostGIS schema in `supabase/migrations/001_localpro_schema.sql`
- safety/trust positioning inspired by Lithuanian nature, smart building, and construction reliability

For production, use a proper commercial tile provider or host tiles under OpenStreetMap usage rules.

## Local Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when Supabase is ready:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_TOKEN=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
AUTH_SESSION_SECRET=
WHATSAPP_VERIFY_TOKEN=
```
