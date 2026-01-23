#!/usr/bin/env node

/**
 * Simple test script for @keeponfirst/kof-stitch-mcp
 *
 * Usage:
 *   GOOGLE_CLOUD_PROJECT=your-project-id npm test
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function test() {
    console.log('Testing @keeponfirst/kof-stitch-mcp\n');

    // Test 1: Check gcloud
    console.log('1. Checking gcloud CLI...');
    try {
        const { stdout } = await execAsync('gcloud --version');
        console.log('   ✓ gcloud installed\n');
    } catch (e) {
        console.log('   ✗ gcloud not found\n');
        process.exit(1);
    }

    // Test 2: Check ADC
    console.log('2. Checking ADC token...');
    try {
        const { stdout } = await execAsync('gcloud auth application-default print-access-token');
        console.log('   ✓ ADC token available\n');
    } catch (e) {
        console.log('   ✗ ADC not configured. Run: gcloud auth application-default login\n');
        process.exit(1);
    }

    // Test 3: Check project
    console.log('3. Checking project ID...');
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    if (projectId) {
        console.log(`   ✓ Project: ${projectId}\n`);
    } else {
        try {
            const { stdout } = await execAsync('gcloud config get-value project');
            const project = stdout.trim();
            if (project && project !== '(unset)') {
                console.log(`   ✓ Project (from gcloud): ${project}\n`);
            } else {
                console.log('   ✗ No project configured\n');
                process.exit(1);
            }
        } catch (e) {
            console.log('   ✗ Could not get project\n');
            process.exit(1);
        }
    }

    // Test 4: Test Stitch API
    console.log('4. Testing Stitch API connection...');
    try {
        const fetch = require('node-fetch');
        const { stdout: token } = await execAsync('gcloud auth application-default print-access-token');
        const project = projectId || (await execAsync('gcloud config get-value project')).stdout.trim();

        const res = await fetch('https://stitch.googleapis.com/mcp', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.trim()}`,
                'X-Goog-User-Project': project,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                params: {},
                id: 1
            })
        });

        const data = await res.json();

        if (data.result?.tools) {
            console.log(`   ✓ Connected! ${data.result.tools.length} tools available\n`);
            console.log('   Tools:');
            data.result.tools.forEach(t => console.log(`     - ${t.name}`));
        } else if (data.error) {
            console.log(`   ✗ API Error: ${data.error.message || JSON.stringify(data.error)}\n`);
            process.exit(1);
        }

    } catch (e) {
        console.log(`   ✗ Error: ${e.message}\n`);
        process.exit(1);
    }

    console.log('\n✅ All tests passed!');
}

test().catch(e => {
    console.error('Test failed:', e.message);
    process.exit(1);
});
