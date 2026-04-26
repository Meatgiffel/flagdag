# FlagPlan

En lille Node.js-app til at oprette flagdags-events og lade frivillige melde sig på ture uden login.

## Lokal kørsel

1. Installer dependencies:

   ```powershell
   npm install
   ```

2. Opret `.env` ud fra `.env.example`, og udfyld `SESSION_SECRET` og `ADMIN_PASSWORD_HASH`.

3. Opret databasen:

   ```powershell
   npm run db:migrate
   ```

4. Start appen:

   ```powershell
   npm run dev
   ```

5. Åbn `http://localhost:3000/admin`.

Du kan oprette et demo-event til test uden admin-login:

```powershell
npm run demo
```

Demo-linket vises i terminalen og får en tilfældig offentlig kode, fx `http://localhost:3000/e/7k4mx9qp`.
Der findes ingen offentlig event-oversigt på forsiden; frivillige skal have et direkte event-link.

## Admin-login

Admin-login bruger Passport.js med et lokalt brugernavn/password og bcrypt-hash. Der bruges ingen eksterne login-services.

Lav et password-hash sådan:

```powershell
npm.cmd run auth:hash -- "dit-nye-password"
```

Sæt derefter hashet i `.env`:

```text
SESSION_SECRET="en-lang-tilfældig-secret"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="hash-fra-kommandoen"
```

Brug ikke et fælles standard-password i produktion. `SESSION_SECRET` skal være lang, tilfældig og hemmelig.

## Hosting

Appen kan hostes som en almindelig Node.js-proces med SQLite-filen ved siden af appen. Sørg for backup af SQLite-filen, og brug en fast hemmelig `SESSION_SECRET` i produktion.
