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


function saveConfig(configPath: string, configData: Record<string, any>) {
  fs.writeFileSync(
    configPath,
    yaml.stringify(configData),
    'utf-8'
  );
}

function ensureConfigExists(configPath: string) {
  const dir = path.dirname(configPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    console.log('[App Startup] No config file found, creating default config at', configPath);
    saveConfig(configPath, ConfigSchema.parse({}));
  }
}

function validateConfig(configPath: string, configData: Record<string, any>) {
  // Get the default config by parsing an empty object (Zod will apply all defaults)
  const defaultConfig = ConfigSchema.parse({});
  
  // Track if we made any changes so we know whether to save
  let configChanged = false;
  
  // Check each top-level section and add missing ones from defaults
  for (const section in defaultConfig) {
    if (!(section in configData)) {
      console.log(`[Config Migration] Adding missing section: ${section}`);
      configData[section] = (defaultConfig as any)[section];
      configChanged = true;
    }
  }
  
  // Now validate the merged config
  const validationResult = ConfigSchema.safeParse(configData);
  
  if (!validationResult.success) {
    console.log('[Config Validation] Config validation failed, applying defaults for invalid sections');
    console.error(validationResult.error.format());
    
    // Deep merge defaults with user config, keeping user values where valid
    const mergedConfig = _.merge({}, defaultConfig, configData);
    
    // Validate the merged config
    const finalConfig = ConfigSchema.parse(mergedConfig);
    
    saveConfig(configPath, finalConfig);
    console.log('[Config Migration] Config migrated and saved');
    
    return finalConfig;
  }
  
  // If we added missing sections, save the updated config
  if (configChanged) {
    saveConfig(configPath, validationResult.data);
    console.log('[Config Migration] Config updated with missing sections');
  }

  return validationResult.data as Record<string, any>;
}

export default function initializeConfig(app: Application) {
  const configDir = path.resolve(process.env.CONFIG_DIR || '~/config/ai-assistant');
  const configFilePath = path.join(configDir, 'config.yaml');
  
  // Make sure we have a config file to read from
  ensureConfigExists(configFilePath);
  
  // Load the config file and set it on the app instance
  const configFile = fs.readFileSync(configFilePath, 'utf-8');

  // Validate the config file against our schema and apply defaults if missing
  // This will automatically migrate old configs by adding any missing sections
  const configData: Record<string, any> = validateConfig(
    configFilePath,
    yaml.parse(configFile)
  );

  // Setup some internal config values
  configData.appVersion = pkg.version;
  configData.appName = 'AI Assistant 2';
  configData.assetDir = path.resolve(configDir, 'assets');

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