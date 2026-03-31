const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

class ChromaBackupManager {
  constructor() {
    this.backupUrl = process.env.RAG_CHROMA_BACKUP_URL || '';
    this.backupZipPath = process.env.RAG_CHROMA_BACKUP_ZIP_PATH || path.join(process.cwd(), 'chroma_db_backup.zip');
    this.chromaDataDir = process.env.RAG_CHROMA_DIR || path.join(process.cwd(), 'chroma_db');
  }

  hasBackupConfigured() {
    return !!this.backupUrl || fs.existsSync(this.backupZipPath);
  }

  toDirectDownloadUrl(url) {
    if (!url) return '';
    const match = url.match(/\/file\/d\/([^/]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
    return url;
  }

  async downloadBackupZipIfNeeded() {
    if (fs.existsSync(this.backupZipPath)) {
      return this.backupZipPath;
    }
    if (!this.backupUrl) {
      return null;
    }

    const directUrl = this.toDirectDownloadUrl(this.backupUrl);
    await fs.promises.mkdir(path.dirname(this.backupZipPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(this.backupZipPath);
      https
        .get(directUrl, (response) => {
          if (response.statusCode !== 200) {
            file.close();
            fs.unlink(this.backupZipPath, () => {});
            reject(new Error(`Téléchargement backup échoué (HTTP ${response.statusCode})`));
            return;
          }
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(this.backupZipPath);
          });
        })
        .on('error', (err) => {
          file.close();
          fs.unlink(this.backupZipPath, () => {});
          reject(err);
        });
    });
  }

  async restoreBackup() {
    const zipPath = await this.downloadBackupZipIfNeeded();
    if (!zipPath || !fs.existsSync(zipPath)) {
      return false;
    }

    await fs.promises.mkdir(this.chromaDataDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(this.chromaDataDir, true);
    return true;
  }
}

module.exports = ChromaBackupManager;
