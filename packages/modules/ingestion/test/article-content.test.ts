import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArticleContentExtractor } from '../src/article-content.extractor';

test('extracts article paragraphs and removes duplicate boilerplate', () => {
  const extractor = new ArticleContentExtractor();
  const paragraph =
    'XRP giảm 5.5% trong tuần khi cuộc bỏ phiếu bị hoãn, trong khi Bitcoin vẫn tương đối ổn định.';
  const result = extractor.extract(
    `<html><article><p>${paragraph}</p><p>${paragraph}</p><p>Advertisement</p><p>Một đoạn nội dung thứ hai cung cấp thêm bối cảnh có nguồn cho người đọc.</p></article></html>`,
    'fallback',
  );
  assert.equal(result.origin, 'article-html');
  assert.equal(result.content.split(paragraph).length - 1, 1);
  assert.equal(result.content.includes('Advertisement'), false);
});
