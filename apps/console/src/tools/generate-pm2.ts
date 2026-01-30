import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { TypeOrmDataManager, AccountInfoEntity } from '@itrade/data-manager';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function generate() {
  console.log('🔄 Connecting to database to fetch active users...');
  
  const dataManager = new TypeOrmDataManager({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'itrade',
    synchronize: false,
    logging: false,
  });

  try {
    await dataManager.initialize();

    const accountRepo = dataManager.dataSource.getRepository(AccountInfoEntity);
    
    // Find all active accounts with users
    const accounts = await accountRepo.find({
        where: { isActive: true },
        relations: ['user'],
        select: {
            user: { id: true },
            exchange: true,
        }
    });

    // Group by User ID
    const users = new Set<string>();
    accounts.forEach(acc => {
        if (acc.user && acc.user.id) {
            users.add(acc.user.id);
        }
    });

    if (users.size === 0) {
        console.warn('⚠️  No active users found in database.');
        await dataManager.close();
        return;
    }

    console.log(`✅ Found ${users.size} active users: ${Array.from(users).join(', ')}`);

    // Generate PM2 Config
    const apps = Array.from(users).map(userId => {
        // Clean name for PM2
        // Assuming userId might be an email or uuid, let's keep it safe.
        // If it's a UUID, it's safe. If email, replace @ with - 
        const safeId = userId.replace(/[^a-zA-Z0-9-]/g, '_');
        return {
            name: `itrade-bot-${safeId}`,
            script: './dist/main.js', 
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                USER_ID: userId,
                NODE_ENV: 'production',
                // Explicitly pass DB vars just in case, though pm2 can inherit
                DB_HOST: process.env.DB_HOST,
                DB_PORT: process.env.DB_PORT,
                DB_USERNAME: process.env.DB_USERNAME,
                DB_PASSWORD: process.env.DB_PASSWORD,
                DB_NAME: process.env.DB_NAME,
                ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
            },
        };
    });

    const configContent = `module.exports = {
  apps: ${JSON.stringify(apps, null, 2)}
};`;

    const outputPath = path.resolve(process.cwd(), 'ecosystem.config.js');
    fs.writeFileSync(outputPath, configContent);
    
    console.log(`\n🎉 Generated ecosystem.config.js at ${outputPath}`);
    console.log(`\n🚀 To start the bots:`);
    console.log(`   npm run build`);
    console.log(`   pm2 start ecosystem.config.js`);
    console.log(`\n📝 To monitor:`);
    console.log(`   pm2 monit`);

  } catch (error) {
    console.error('❌ Error generating PM2 config:', error);
  } finally {
    if (dataManager['isInitialized']) { // Hack check if connected
        await dataManager.close();
    }
  }
}

generate().catch(console.error);
