import dotenv from "dotenv";
import { Application } from "express";
import { ConfigSchema } from './config/config.schema.js';
import path from "node:path";
import fs from "node:fs";
import yaml from "yaml";
import _ from 'lodash';
import pkg from '../../package.json' assert { type: 'json' };

// Initialize the environment variables from the .env file
dotenv.config();


function ensureConfigExists(configPath: string) {
  const dir = path.dirname(configPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    console.log('[App Startup] No config file found, creating default config at', configPath);
    fs.writeFileSync(
      configPath,
      yaml.stringify(ConfigSchema.parse({})),
      'utf-8'
    );
  }
}

export default function initializeConfig(app: Application) {
  const configDir = path.resolve(process.env.CONFIG_DIR || '~/config/ai-assistant');
  
  // Make sure we have a config file to read from
  ensureConfigExists(path.join(configDir, 'config.yaml'));
  
  // Load the config file and set it on the app instance
  const configFile = fs.readFileSync(path.join(configDir, 'config.yaml'), 'utf-8');
  const configData: Record<string, any> = yaml.parse(configFile);

  // Setup some internal config values
  configData.appVersion = pkg.version;
  configData.appName = 'AI Assistant 2';

  // Set up a simple config getter on the app instance
  app.config = {
    _configData: configData,
    get: function(key: string, defaultValue: string = ''): string {
      // First check environment variables, then config file, then default value
      const envValue = process.env[key];
      if (envValue !== undefined) {
        return envValue;
      }

      return _.get(this._configData, key, defaultValue);
    },

    getBoolean: function(key: string, defaultValue: boolean = false): boolean {
      return this.get(key, String(defaultValue)) === 'true';
    },

    getNumber: function(key: string, defaultValue: number = 0): number {
      const val = this.get(key, String(defaultValue));

      const num = parseInt(val, 10);
      
      return isNaN(num) ? defaultValue : num;
    },
    has: function(key: string): boolean {
      return this.get(key) !== '';
    }
  };
}