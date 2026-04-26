import bcrypt from "bcryptjs";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { page, setupAuthPage, forbiddenPage } from "./render.js";

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

    passport.authenticate("local", (error, user) => {
      if (error) return next(error);
      if (!user) {
        res.redirect("/admin/login?error=1");
        return;
      }

      req.logIn(user, (loginError) => {
        if (loginError) return next(loginError);
        res.redirect("/admin");
      });
    })(req, res, next);
  });

  app.post("/admin/logout", (req, res, next) => {
    req.logout((error) => {
      if (error) return next(error);

      req.session.destroy((destroyError) => {
        if (destroyError) return next(destroyError);
        res.clearCookie("flagplan.sid");
        res.redirect("/");
      });
    });
  });
}

export async function getAdminSession(req) {
  if (!authIsConfigured() || !req.isAuthenticated?.() || !req.user) return null;
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
