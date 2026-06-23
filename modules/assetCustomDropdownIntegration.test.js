import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./AssetManager.js', import.meta.url), 'utf8');

test('custom asset tag dropdown is rendered as a fixed body overlay', () => {
  assert.match(source, /document\.body\.appendChild\(dropdown\)/);
  assert.match(source, /\.v2-asset-custom-tag-dropdown\{position:fixed;/);
});

test('custom asset tag dropdown binds to sidebar tab divs', () => {
  assert.match(source, /querySelectorAll\('\.v2-asset-sidebar-tab'\)/);
});

test('custom asset tag dropdown pointerdown does not close the asset panel', () => {
  assert.match(source, /dropdown\.addEventListener\('pointerdown',event=>\{event\.stopPropagation\(\);\}\)/);
});

test('custom asset tag dropdown keeps the asset sidebar open while visible', () => {
  assert.match(source, /function _assetCustomShouldKeepSidebarOpen\(manager\)/);
  assert.match(source, /const _assetManagerHideSidebarPanel=AssetManager\.prototype\.hideSidebarPanel/);
  assert.match(source, /if\(_assetCustomShouldKeepSidebarOpen\(this\)\)return;/);
});

test('custom asset tag dropdown always reserves five rows before scrolling', () => {
  assert.match(source, /\.v2-asset-custom-tag-dropdown__list\{height:176px;max-height:176px;overflow-y:auto;/);
});

test('create panel custom tag dropdown shows at most two rows before scrolling', () => {
  assert.match(source, /\.v2-asset-create-custom-tag-dropdown\{[^}]*max-height:78px;overflow-y:auto;[^}]*box-sizing:border-box;[^}]*scrollbar-width:thin/);
});

test('asset sidebar adds clothing and style as first-level categories', () => {
  assert.match(source, /const ASSET_EXTRA_CATEGORIES=\['\\u670d\\u88c5','\\u98ce\\u683c'\]/);
  assert.match(source, /function _assetCategoryEnsureSidebarTabs\(manager\)/);
  assert.match(source, /_assetCategoryEnsureSidebarTabs\(this\)/);
});

test('asset create panel can choose clothing and style categories', () => {
  assert.match(source, /function _assetCategoryEnsureCreateOptions\(manager\)/);
  assert.match(source, /_assetCategoryEnsureCreateOptions\(this\)/);
});

test('asset sidebar expands to six category tabs and three asset columns', () => {
  assert.match(source, /\.v2-asset-sidebar-panel\{width:342px;max-width:calc\(100vw - 24px\);/);
  assert.match(source, /\.v2-asset-sidebar-tabs\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\);/);
  assert.match(source, /\.v2-asset-sidebar-content \.v2-asset-view-list\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
});
