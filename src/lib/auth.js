import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { page, setupAuthPage, forbiddenPage } from "./render.js";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const failedLoginAttempts = new Map();

export function adminUsername() {
  return (process.env.ADMIN_USERNAME ?? "admin").trim();
}

export function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.AUTH_SECRET || "";
}

export function authIsConfigured() {
  return Boolean(adminUsername() && process.env.ADMIN_PASSWORD_HASH && sessionSecret());
}

export function configuredProviders() {
  return authIsConfigured() ? [{ id: "local", name: "Lokalt admin-login" }] : [];
}

export function mountAuth(app) {
  app.use(
    session({
      name: "flagplan.sid",
      secret: sessionSecret() || "missing-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 12,
      },
    }),
  );

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        if (!authIsConfigured()) return done(null, false);

        const expectedUsername = adminUsername().toLowerCase();
        const providedUsername = String(username ?? "").trim().toLowerCase();
        const passwordMatches = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);

        if (providedUsername !== expectedUsername || !passwordMatches) {
          return done(null, false);
        }

        return done(null, {
          id: "admin",
          username: adminUsername(),
          email: adminUsername(),
          passwordVersion: adminPasswordVersion(),
        });
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  app.use(passport.initialize());
  app.use(passport.session());

  app.post("/admin/login", (req, res, next) => {
    if (!authIsConfigured()) {
      res.status(503).send(page({ title: "Login mangler opsætning", body: setupAuthPage(req) }));
      return;
    }

    const rateLimit = loginRateLimit(req);
    if (rateLimit.limited) {
      res.set("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).send(loginRateLimitPage(rateLimit.retryAfterSeconds));
      return;
    }

    passport.authenticate("local", (error, user) => {
      if (error) return next(error);
      if (!user) {
        registerFailedLogin(req);
        res.redirect("/admin/login?error=1");
        return;
      }

      req.session.regenerate((sessionError) => {
        if (sessionError) return next(sessionError);

        req.logIn(user, (loginError) => {
          if (loginError) return next(loginError);
          clearFailedLogins(req);
          res.redirect("/admin");
        });
      });
    })(req, res, next);
  });

  app.post("/admin/logout", (req, res, next) => {
    req.logout((error) => {
      if (error) return next(error);

      req.session.destroy((destroyError) => {
        if (destroyError) return next(destroyError);
        res.clearCookie("flagplan.sid", { path: "/" });
        res.redirect("/");
      });
    });
  });
}

export async function getAdminSession(req) {
  if (!authIsConfigured() || !req.isAuthenticated?.() || !req.user) return null;
  if (req.user.passwordVersion !== adminPasswordVersion()) return null;
  return { user: req.user };
}

export async function requireAdmin(req, res, next) {
  if (!authIsConfigured()) {
    res.status(503).send(page({ title: "Login mangler opsætning", body: setupAuthPage(req) }));
    return;
  }

  const session = await getAdminSession(req);

  if (!session?.user) {
    res.redirect("/admin/login");
    return;
  }

  if (String(session.user.username ?? "").toLowerCase() !== adminUsername().toLowerCase()) {
    res.status(403).send(page({ title: "Ingen adgang", body: forbiddenPage(session.user.username) }));
    return;
  }

  res.locals.session = session;
  next();
}

export async function verifyAdminPassword(password) {
  if (!authIsConfigured()) return false;
  return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
}

export async function updateAdminPassword(password) {
  const passwordHash = await bcrypt.hash(password, 12);
  const envPath = path.resolve(process.cwd(), process.env.ENV_FILE || ".env");
  const envContent = await fs.readFile(envPath, "utf8");
  const nextEnvContent = setEnvValue(envContent, "ADMIN_PASSWORD_HASH", passwordHash);
  const tempPath = `${envPath}.${process.pid}.tmp`;

  await fs.writeFile(tempPath, nextEnvContent, { mode: 0o600 });
  await fs.rename(tempPath, envPath);

  process.env.ADMIN_PASSWORD_HASH = passwordHash;
  return passwordHash;
}

function loginRateLimit(req) {
  cleanupLoginAttempts();

  const attempt = failedLoginAttempts.get(loginRateKey(req));
  if (!attempt || attempt.resetAt <= Date.now() || attempt.count < LOGIN_MAX_ATTEMPTS) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000)),
  };
}

function registerFailedLogin(req) {
  const key = loginRateKey(req);
  const now = Date.now();
  const attempt = failedLoginAttempts.get(key);

  if (!attempt || attempt.resetAt <= now) {
    failedLoginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  attempt.count += 1;
  failedLoginAttempts.set(key, attempt);
}

function clearFailedLogins(req) {
  failedLoginAttempts.delete(loginRateKey(req));
}

function loginRateKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function cleanupLoginAttempts() {
  const now = Date.now();
  for (const [key, attempt] of failedLoginAttempts.entries()) {
    if (attempt.resetAt <= now) failedLoginAttempts.delete(key);
  }
}

function loginRateLimitPage(retryAfterSeconds) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return page({
    title: "For mange loginforsøg",
    body: `<section class="narrow flow">
      <p class="eyebrow">Admin-login</p>
      <h1>For mange loginforsøg</h1>
      <p>Vent cirka ${minutes} minutter, og prøv igen.</p>
      <a class="button secondary" href="/admin/login">Til login</a>
    </section>`,
  });
}

function adminPasswordVersion() {
  return createHash("sha256").update(process.env.ADMIN_PASSWORD_HASH ?? "").digest("hex");
}

function setEnvValue(content, key, value) {
  const line = `${key}=${quoteEnvValue(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const suffix = content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

function quoteEnvValue(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
