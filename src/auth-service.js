const nodemailer = require('nodemailer');

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

    const verification = await this.supabaseService.getLatestVerificationCode(normalizedEmail);
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
}

module.exports = AuthService;
