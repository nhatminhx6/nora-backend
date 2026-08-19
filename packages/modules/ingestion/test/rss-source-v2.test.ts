import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { RssSourceV2Adapter, rawEnvelopeFixture } from '../src/rss-source-v2.adapter';
import { CanonicalCandidate } from '../src/source-adapter';

const adapter = new RssSourceV2Adapter();

function firstCandidate(candidates: CanonicalCandidate[]): CanonicalCandidate {
  assert.ok(candidates[0], 'expected one canonical candidate');
  return candidates[0];
}

test('normalizes RSS 2.0 into provenance-rich canonical candidates', async () => {
  const candidate = firstCandidate(
    await adapter.normalize(
      rawEnvelopeFixture(`
      <rss version="2.0"><channel><title>Nora Publisher</title><item>
        <guid>article-1</guid><title>Market update</title>
        <link>https://publisher.test/news/market-update</link>
        <description>Stocks gained 2% after the policy decision.</description>
        <pubDate>Fri, 14 Aug 2026 07:00:00 GMT</pubDate>
        <author>Reporter One</author>
      </item></channel></rss>`),
    ),
  );
  assert.equal(candidate.externalId, 'article-1');
  assert.equal(candidate.publisher, 'Nora Publisher');
  assert.equal(candidate.author, 'Reporter One');
  assert.deepEqual(candidate.topicHints, ['technology']);
  assert.equal(candidate.rawEvidence[0]?.path, 'rss.channel.item[0]');
});

test('normalizes Atom links and object-shaped fields', async () => {
  const candidate = firstCandidate(
    await adapter.normalize(
      rawEnvelopeFixture(
        `
      <feed xmlns="http://www.w3.org/2005/Atom"><title>Nora Atom</title><entry>
        <id>tag:publisher.test,2026:article-2</id>
        <title type="text">Object shaped title</title>
        <link rel="alternate" href="/stories/object-shaped" />
        <summary type="html">Useful &amp;amp; verified summary.</summary>
        <updated>2026-08-14T07:00:00Z</updated>
        <author><name>Reporter Two</name></author>
      </entry></feed>`,
        'https://redirected.publisher.test/feeds/current.xml',
      ),
    ),
  );
  assert.equal(candidate.originalTitle, 'Object shaped title');
  assert.equal(
    candidate.canonicalUrlCandidate,
    'https://redirected.publisher.test/stories/object-shaped',
  );
  assert.equal(candidate.publisher, 'Nora Atom');
  assert.equal(candidate.rawEvidence[0]?.path, 'feed.entry[0]');
});

test('does not select media or enclosure links as article URL', async () => {
  const candidate = firstCandidate(
    await adapter.normalize(
      rawEnvelopeFixture(`
      <feed><title>Publisher</title><entry><id>article-3</id><title>Media item</title>
        <link rel="enclosure" type="audio/mpeg" href="https://cdn.test/audio.mp3" />
        <link rel="alternate" type="text/html" href="https://publisher.test/articles/media-item" />
        <summary>Article summary</summary><published>2026-08-14T07:00:00Z</published>
      </entry></feed>`),
    ),
  );
  assert.equal(candidate.canonicalUrlCandidate, 'https://publisher.test/articles/media-item');
});

test('validates canonical detail URL and required provenance', async () => {
  const candidate = firstCandidate(
    await adapter.normalize(
      rawEnvelopeFixture(`
      <rss><channel><title>Publisher</title><item><title>Valid article</title>
        <link>https://publisher.test/articles/valid</link><description>Content</description>
        <pubDate>2026-08-14T07:00:00Z</pubDate></item></channel></rss>`),
    ),
  );
  const valid = await adapter.validate(candidate);
  assert.equal(valid.valid, true);
  assert.equal(valid.canonicalUrl, 'https://publisher.test/articles/valid');
  assert.equal(
    (await adapter.validate({ ...candidate, canonicalUrlCandidate: 'http://x.test/' })).valid,
    false,
  );
});
