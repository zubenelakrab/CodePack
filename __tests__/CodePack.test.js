const CodePack = require('../src/index');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

jest.mock('fs-extra');
jest.mock('glob');
jest.mock('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: ''
  }))
}));
jest.mock('ignore', () => jest.fn(() => ({
  add: jest.fn(),
  ignores: jest.fn(() => false)
})));

describe('CodePack', () => {
  let tempDir;
  let originalExit;
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), 'codepack-test-' + Date.now());
    originalExit = process.exit;
    process.exit = jest.fn();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ isDirectory: () => true });
    fs.realpathSync.mockImplementation(p => p);
    fs.ensureDir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
  });

  afterEach(() => {
    process.exit = originalExit;
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set default options', () => {
      const codePack = new CodePack();
      expect(codePack.outputPath).toBe('codepack-output.md');
      expect(codePack.verbose).toBe(false);
      expect(codePack.maxFileSize).toBe(500 * 1024);
      expect(codePack.compact).toBe(false);
      expect(codePack.smartCompress).toBe(false);
      expect(codePack.maxFiles).toBe(Infinity);
      expect(codePack.totalSizeLimit).toBe(50 * 1024 * 1024);
    });

    it('should accept custom options', () => {
      const options = {
        input: '/custom/path',
        output: 'custom-output.md',
        verbose: true,
        maxSize: '200',
        compact: true,
        smart: true
      };
      
      const codePack = new CodePack(options);
      expect(codePack.outputPath).toBe('custom-output.md');
      expect(codePack.verbose).toBe(true);
      expect(codePack.maxFileSize).toBe(200 * 1024);
      expect(codePack.compact).toBe(true);
      expect(codePack.smartCompress).toBe(true);
    });

    it('should handle parseInt with radix correctly', () => {
      const codePack = new CodePack({ maxSize: '100' });
      expect(codePack.maxFileSize).toBe(100 * 1024);
    });
  });

  describe('validateInputPath', () => {
    it('should reject non-existent paths', () => {
      fs.existsSync.mockReturnValue(false);
      
      const codePack = new CodePack({ input: '/non/existent' });
      
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Input path does not exist')
      );
    });

    it('should reject non-directory paths', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      
      const codePack = new CodePack({ input: '/path/to/file.txt' });
      
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Input path is not a directory')
      );
    });

    it('should reject restricted system directories', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.realpathSync.mockReturnValue('/etc/passwd');
      
      const codePack = new CodePack({ input: '/etc/passwd' });
      
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Access to system directory is restricted')
      );
    });
  });

  describe('file filtering', () => {
    let codePack;

    beforeEach(() => {
      codePack = new CodePack();
    });

    describe('isBinaryFile', () => {
      it('should identify binary files', () => {
        expect(codePack.isBinaryFile('.exe')).toBe(true);
        expect(codePack.isBinaryFile('.jpg')).toBe(true);
        expect(codePack.isBinaryFile('.pdf')).toBe(true);
        expect(codePack.isBinaryFile('.zip')).toBe(true);
      });

      it('should not identify text files as binary', () => {
        expect(codePack.isBinaryFile('.js')).toBe(false);
        expect(codePack.isBinaryFile('.txt')).toBe(false);
        expect(codePack.isBinaryFile('.md')).toBe(false);
      });
    });

    describe('isSourceFile', () => {
      it('should identify source files', () => {
        expect(codePack.isSourceFile('.js', 'app.js')).toBe(true);
        expect(codePack.isSourceFile('.py', 'script.py')).toBe(true);
        expect(codePack.isSourceFile('.html', 'index.html')).toBe(true);
      });

      it('should identify config files', () => {
        expect(codePack.isSourceFile('.json', 'package.json')).toBe(true);
        expect(codePack.isSourceFile('.js', 'webpack.config.js')).toBe(true);
        expect(codePack.isSourceFile('', 'Dockerfile')).toBe(true);
      });

      it('should not identify non-source files', () => {
        expect(codePack.isSourceFile('.tmp', 'temp.tmp')).toBe(false);
        expect(codePack.isSourceFile('.bak', 'backup.bak')).toBe(false);
      });
    });
  });

  describe('compression modes', () => {
    let codePack;

    beforeEach(() => {
      codePack = new CodePack();
    });

    describe('optimizeContent', () => {
      it('should remove excessive whitespace', () => {
        const input = 'line1\n\n\n\nline2\n  \n  \nline3';
        const output = codePack.optimizeContent(input);
        expect(output).toBe('line1\n\nline2\n\nline3');
      });

      it('should remove comments', () => {
        const input = `
          // This is a comment
          const x = 1; // inline comment
          /* Multi-line
             comment */
          const y = 2;
        `;
        const output = codePack.optimizeContent(input);
        expect(output).not.toContain('//');
        expect(output).not.toContain('/*');
        expect(output).toContain('const x = 1;');
        expect(output).toContain('const y = 2;');
      });
    });

    describe('aggressiveSmartOptimize', () => {
      it('should minify JavaScript imports', () => {
        const input = `import { Component, useState, useEffect } from 'react';`;
        const output = codePack.aggressiveSmartOptimize(input, 'js');
        expect(output).toBe(`import{Component,useState,useEffect}from'react';`);
      });

      it('should minify CSS', () => {
        const input = `.class { color: red; margin: 10px; }`;
        const output = codePack.aggressiveSmartOptimize(input, 'css');
        expect(output).toBe(`.class{color:red;margin:10px;}`);
      });
    });
  });

  describe('error handling', () => {
    let codePack;

    beforeEach(() => {
      const glob = require('glob');
      glob.mockImplementation((pattern, options, callback) => {
        callback(null, ['file1.js', 'file2.js']);
      });
      
      codePack = new CodePack();
    });

    it('should collect errors and display them', async () => {
      fs.readFile.mockRejectedValue(new Error('Permission denied'));
      
      await codePack.compress();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Errors encountered:')
      );
    });

    it('should handle large numbers of files without limit', async () => {
      const glob = require('glob');
      const files = Array(2000).fill('file.js');
      glob.mockImplementation((pattern, options, callback) => {
        callback(null, files);
      });
      
      fs.readFile.mockResolvedValue('test content');
      fs.statSync.mockReturnValue({ size: 100 });
      
      await codePack.compress();
      
      // Should not exit with error for large file counts
      expect(process.exit).not.toHaveBeenCalledWith(1);
    });

    it('should enforce output size limit', async () => {
      const glob = require('glob');
      glob.mockImplementation((pattern, options, callback) => {
        callback(null, ['file.js']);
      });
      
      fs.readFile.mockResolvedValue('x'.repeat(60 * 1024 * 1024)); // 60MB
      codePack.totalSizeLimit = 50 * 1024 * 1024; // 50MB
      
      await codePack.compress();
      
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy.mock.calls[0][1]).toContain('Output too large');
    });
  });

  describe('utility methods', () => {
    let codePack;

    beforeEach(() => {
      codePack = new CodePack();
    });

    it('should detect technologies', () => {
      const files = [
        'package.json',
        'src/app.ts',
        'main.py',
        'Dockerfile'
      ];
      
      const technologies = codePack.detectTechnologies(files);
      
      expect(technologies).toContain('Node.js/JavaScript');
      expect(technologies).toContain('TypeScript');
      expect(technologies).toContain('Python');
      expect(technologies).toContain('Docker');
    });

    it('should prioritize files correctly', () => {
      const files = [
        'src/utils.js',
        'README.md',
        'package.json',
        'index.js',
        'test.spec.js'
      ];
      
      const sorted = codePack.prioritizeFiles(files);
      
      expect(sorted[0]).toBe('README.md');
      expect(sorted[1]).toBe('package.json');
      expect(sorted[2]).toBe('index.js');
    });

    it('should group files by purpose', () => {
      const files = [
        'package.json',
        'src/components/Button.js',
        'src/api/users.js',
        'src/utils/helpers.js',
        'test/app.test.js',
        'app.test.js',
        'styles/main.css'
      ];
      
      const groups = codePack.groupFilesByPurpose(files);
      
      expect(groups['⚙️ Configuration']).toContain('package.json');
      expect(groups['🧩 Components']).toContain('src/components/Button.js');
      expect(groups['🔌 API/Routes']).toContain('src/api/users.js');
      expect(groups['🛠 Utilities']).toContain('src/utils/helpers.js');
      // Both test files should be in the Tests group
      expect(groups['🧪 Tests']).toContain('test/app.test.js');
      expect(groups['🧪 Tests']).toContain('app.test.js');
      expect(groups['🎨 Styles']).toContain('styles/main.css');
    });
  });
});