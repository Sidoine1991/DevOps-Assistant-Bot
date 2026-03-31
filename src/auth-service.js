const nodemailer = require('nodemailer');
const crypto = require('crypto');

class AuthService {
  constructor(supabaseService) {
    this.supabaseService = supabaseService;
    this.adminEmail = process.env.ADMIN_EMAIL || 'syebadokpo@gmail.com';
    this.smtpHost = process.env.SMTP_HOST || '';
    this.smtpPort = Number(process.env.SMTP_PORT || 587);
    this.smtpUser = process.env.SMTP_USER || '';
    this.smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
    this.smtpSecure = process.env.SMTP_SECURE === 'true';
    this.codeTtlMinutes = Number(process.env.AUTH_CODE_TTL_MINUTES || 10);
  }

  buildTransporter() {
    if (!this.smtpUser || !this.smtpPass) {
      return null;
    }

    // Mode simplifié Gmail si SMTP_HOST non défini
    if (!this.smtpHost) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: this.smtpUser,
          pass: this.smtpPass,
        },
      });
    }

    return nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpSecure,
      auth: {
        user: this.smtpUser,
        pass: this.smtpPass,
      },
    });
  }

  generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  hashPassword(password) {
    return crypto.createHash('sha256').update(String(password || '')).digest('hex');
  }

  async registerWithPassword(email, password, fullName = '') {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const rawPassword = String(password || '');
    if (!normalizedEmail || !rawPassword) {
      return { success: false, code: 'VALIDATION_ERROR', message: 'Email et mot de passe requis.' };
    }
    if (rawPassword.length < 6) {
      return { success: false, code: 'WEAK_PASSWORD', message: 'Le mot de passe doit contenir au moins 6 caractères.' };
    }

    const existing = await this.supabaseService.getUserByEmail(normalizedEmail);
    if (existing) {
      return { success: false, code: 'EMAIL_ALREADY_USED', message: 'Cet email est déjà utilisé.' };
    }

    const user = await this.supabaseService.createUserWithPassword({
      email: normalizedEmail,
      fullName,
      passwordHash: this.hashPassword(rawPassword),
    });
    if (!user) {
      return { success: false, code: 'REGISTER_FAILED', message: 'Impossible de créer le compte.' };
    }

    return {
      success: true,
      code: 'REGISTERED',
      message: 'Compte créé avec succès.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name || '',
        isVerified: true,
      },
    };
  }

  async loginWithPassword(email, password) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const rawPassword = String(password || '');
    if (!normalizedEmail || !rawPassword) {
      return { success: false, code: 'VALIDATION_ERROR', message: 'Email et mot de passe requis.' };
    }
    const user = await this.supabaseService.getUserByEmail(normalizedEmail);
    if (!user || !user.password_hash) {
      return { success: false, code: 'INVALID_CREDENTIALS', message: 'Identifiants invalides.' };
    }
    const valid = user.password_hash === this.hashPassword(rawPassword);
    if (!valid) {
      return { success: false, code: 'INVALID_CREDENTIALS', message: 'Identifiants invalides.' };
    }

    return {
      success: true,
      code: 'LOGGED_IN',
      message: 'Connexion réussie.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name || '',
        isVerified: true,
      },
    };
  }

  async requestVerificationCode(email, fullName = '') {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return { success: false, code: 'VALIDATION_ERROR', message: 'Email requis.' };
    }

    const user = await this.supabaseService.upsertUserByEmail(normalizedEmail, fullName);
    if (!user) {
      return {
        success: false,
        code: 'USER_SAVE_FAILED',
        message: 'Impossible de créer/utiliser cet utilisateur. Vérifiez la migration RLS users/auth_verification_codes.'
      };
    }

    const verificationCode = this.generateCode();
    const expiresAt = new Date(Date.now() + this.codeTtlMinutes * 60 * 1000).toISOString();

    const saved = await this.supabaseService.saveVerificationCode({
      userId: user.id,
      email: normalizedEmail,
      code: verificationCode,
      expiresAt,
      purpose: 'verify',
    });
    if (!saved) {
      return { success: false, code: 'CODE_SAVE_FAILED', message: 'Impossible de générer le code de vérification.' };
    }

    const transporter = this.buildTransporter();
    if (!transporter) {
      return {
        success: true,
        code: 'SMTP_NOT_CONFIGURED',
        message: 'Code généré (SMTP non configuré côté serveur).',
        debugCode: verificationCode,
        userId: user.id,
      };
    }

    await transporter.sendMail({
      from: `"DevOps Assistant Bot" <${this.adminEmail}>`,
      to: normalizedEmail,
      subject: 'Code de vérification DevOps Assistant Bot',
      text: `Bonjour,\n\nVotre code de vérification est: ${verificationCode}\nCe code expire dans ${this.codeTtlMinutes} minutes.\n\n- DevOps Assistant Bot`,
    });

    return {
      success: true,
      code: 'CODE_SENT',
      message: 'Code de vérification envoyé par email.',
      userId: user.id,
    };
  }

  async verifyCode(email, submittedCode) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const code = (submittedCode || '').trim();
    if (!normalizedEmail || !code) {
      return { success: false, code: 'VALIDATION_ERROR', message: 'Email et code requis.' };
    }

    const verification = await this.supabaseService.getLatestVerificationCode(normalizedEmail, 'verify');
    if (!verification) {
      return { success: false, code: 'CODE_NOT_FOUND', message: 'Aucun code trouvé pour cet email.' };
    }
    if (verification.used_at) {
      return { success: false, code: 'CODE_ALREADY_USED', message: 'Ce code a déjà été utilisé.' };
    }
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return { success: false, code: 'CODE_EXPIRED', message: 'Le code a expiré.' };
    }
    if (verification.code !== code) {
      return { success: false, code: 'CODE_INVALID', message: 'Code incorrect.' };
    }

    const markedUsed = await this.supabaseService.markVerificationCodeUsed(verification.id);
    if (!markedUsed) {
      return { success: false, code: 'CODE_UPDATE_FAILED', message: 'Impossible de valider ce code.' };
    }

    const user = await this.supabaseService.verifyUserEmail(normalizedEmail);
    if (!user) {
      return { success: false, code: 'USER_VERIFY_FAILED', message: 'Impossible de vérifier cet utilisateur.' };
    }

    return {
      success: true,
      code: 'VERIFIED',
      message: 'Compte vérifié avec succès.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name || '',
        isVerified: user.is_verified,
      },
    };
  }

  async requestPasswordReset(email) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return { success: false, code: 'VALIDATION_ERROR', message: 'Email requis.' };
    }

    const user = await this.supabaseService.getUserByEmail(normalizedEmail);
    const genericOk = {
      success: true,
      code: 'RESET_EMAIL_SENT',
      message: 'Si cet email est associé à un compte avec mot de passe, un code de réinitialisation vient d’être envoyé.',
    };

    if (!user || !user.password_hash) {
      return genericOk;
    }

    const resetCode = this.generateCode();
    const expiresAt = new Date(Date.now() + this.codeTtlMinutes * 60 * 1000).toISOString();
    const saved = await this.supabaseService.saveVerificationCode({
      userId: user.id,
      email: normalizedEmail,
      code: resetCode,
      expiresAt,
      purpose: 'password_reset',
    });
    if (!saved) {
      return { success: false, code: 'CODE_SAVE_FAILED', message: 'Impossible de générer le code. Réessayez plus tard.' };
    }

    const transporter = this.buildTransporter();
    if (!transporter) {
      return {
        ...genericOk,
        code: 'SMTP_NOT_CONFIGURED',
        message: `${genericOk.message} (SMTP non configuré : voir le code ci-dessous en développement.)`,
        debugCode: resetCode,
      };
    }

    await transporter.sendMail({
      from: `"DevOps Assistant Bot" <${this.adminEmail}>`,
      to: normalizedEmail,
      subject: 'Réinitialisation du mot de passe — DevOps Assistant Bot',
      text:
        `Bonjour,\n\nVotre code de réinitialisation est : ${resetCode}\n` +
        `Il expire dans ${this.codeTtlMinutes} minutes.\n\n` +
        'Si vous n’avez pas demandé cette réinitialisation, ignorez ce message.\n\n— DevOps Assistant Bot',
    });

    return genericOk;
  }

  async resetPasswordWithCode(email, submittedCode, newPassword) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const code = (submittedCode || '').trim();
    const rawPassword = String(newPassword || '');
    if (!normalizedEmail || !code || !rawPassword) {
      return { success: false, code: 'VALIDATION_ERROR', message: 'Email, code et nouveau mot de passe requis.' };
    }
    if (rawPassword.length < 6) {
      return { success: false, code: 'WEAK_PASSWORD', message: 'Le mot de passe doit contenir au moins 6 caractères.' };
    }

    const verification = await this.supabaseService.getLatestVerificationCode(
      normalizedEmail,
      'password_reset'
    );
    if (!verification) {
      return { success: false, code: 'CODE_NOT_FOUND', message: 'Aucun code valide pour cet email. Demandez un nouveau code.' };
    }
    if (verification.used_at) {
      return { success: false, code: 'CODE_ALREADY_USED', message: 'Ce code a déjà été utilisé.' };
    }
    if (new Date(verification.expires_at).getTime() < Date.now()) {
      return { success: false, code: 'CODE_EXPIRED', message: 'Le code a expiré. Demandez-en un nouveau.' };
    }
    if (verification.code !== code) {
      return { success: false, code: 'CODE_INVALID', message: 'Code incorrect.' };
    }

    const markedUsed = await this.supabaseService.markVerificationCodeUsed(verification.id);
    if (!markedUsed) {
      return { success: false, code: 'CODE_UPDATE_FAILED', message: 'Impossible de valider ce code.' };
    }

    const updated = await this.supabaseService.updateUserPasswordHashByEmail(
      normalizedEmail,
      this.hashPassword(rawPassword)
    );
    if (!updated) {
      return { success: false, code: 'PASSWORD_UPDATE_FAILED', message: 'Impossible de mettre à jour le mot de passe.' };
    }

    return {
      success: true,
      code: 'PASSWORD_RESET_OK',
      message: 'Mot de passe mis à jour. Vous pouvez vous connecter.',
    };
  }
}

module.exports = AuthService;
