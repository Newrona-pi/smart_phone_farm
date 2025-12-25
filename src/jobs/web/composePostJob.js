const fs = require('fs');
const path = require('path');
const he = require('he'); // For HTML entity decoding
const configDefault = require('../../../config/config.json');
const { findPreviousSuccessRun } = require('../../runner/runUtils');
require('dotenv').config();

function cleanText(text) {
    if (!text) return '';
    let cleaned = he.decode(text); // decode &amp; etc
    cleaned = cleaned.replace(/<[^>]*>/g, ''); // remove html tags
    cleaned = cleaned.replace(/\s+/g, ' ').trim(); // normalize whitespace
    return cleaned;
}

function stripEmojisAndBang(s) {
    if (!s) return '';
    // 絵文字ざっくり除去（広め）
    s = s.replace(/[\u{1F000}-\u{1FAFF}]/gu, '');
    // 半角/全角 ! を除去（後でhighのみ許可する）
    s = s.replace(/[!！]/g, '');
    return s;
}

function removeForbiddenPhrases(s) {
    if (!s) return '';
    const forbidden = [
        'リンク', 'チェックして', 'チェックしてね', '見逃せない', 'してみてね', '気になる', '詳細は'
    ];
    for (const f of forbidden) s = s.split(f).join('');
    return s.trim();
}

function postProcessComposed(composed) {
    // 安全に文字列化
    const title = String(composed.titleLine || '');
    const lines = Array.isArray(composed.lines) ? composed.lines.map(x => String(x || '')) : [];

    // 基本の強制除去
    composed.titleLine = removeForbiddenPhrases(stripEmojisAndBang(title));
    composed.lines = lines.slice(0, 3).map(l => removeForbiddenPhrases(stripEmojisAndBang(l)));

    // tone=highのみ「！」1回を許可（titleLine末尾に付ける）
    if (composed.tone === 'high') {
        // すでに末尾が！なら重複しないように
        if (!composed.titleLine.endsWith('！')) composed.titleLine = composed.titleLine + '！';
    }

    // 「リンク」言及を完全排除（念押し）
    composed.titleLine = composed.titleLine.replace(/リンク|URL/gi, '').trim();
    composed.lines = composed.lines.map(l => l.replace(/リンク|URL/gi, '').trim());

    // 文字数ガード（雑に切る）
    composed.titleLine = composed.titleLine.slice(0, 40);
    composed.lines = composed.lines.map(l => l.slice(0, 60));

    return composed;
}

module.exports = {
    run: async (context) => {
        const { logger, artifactsDir } = context;
        const config = configDefault.composePost || {};
        const model = config.model || "gpt-4o-mini";

        logger.log(`Job: composePost`);
        logger.log(`Model: ${model}`);

        if (!config.useLLM || !process.env.OPENAI_API_KEY) {
            logger.log("LLM disabled or API key missing. Skipping composition.");
            return { composed: 0 };
        }

        const { OpenAI } = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // 1. Find latest rssWatch run
        const runsDir = path.resolve(artifactsDir, '../..');
        const rssRunPath = findPreviousSuccessRun(runsDir, 'rssWatch');

        if (!rssRunPath) {
            logger.log('No previous successful rssWatch run found. Skipping.');
            return { composed: 0 };
        }

        const newItemsPath = path.join(rssRunPath, 'artifacts', 'new_items.json');
        if (!fs.existsSync(newItemsPath)) {
            logger.log(`No new_items.json found in ${rssRunPath}. Skipping.`);
            return { composed: 0 };
        }

        const newItems = JSON.parse(fs.readFileSync(newItemsPath, 'utf8'));
        if (newItems.length === 0) {
            logger.log('No new items to compose. Skipping.');
            return { composed: 0 };
        }

        logger.log(`Found ${newItems.length} items to compose.`);
        const composedItems = [];

        for (const item of newItems) {
            try {
                const cleanTitle = cleanText(item.title);
                const cleanSummary = cleanText(item.summary);

                logger.log(`Composing for: ${cleanTitle}`);

                // Revised Prompt for Analyst Tone (Strict)
                const systemPrompt = `
あなたはAI・研究動向に詳しいアナリストです。
目的は「X風（口語寄り）だが軽すぎない」日本語の短文を作ることです。
ニュース原稿ではなく、技術者・企画・Bizが読んで“実務に役立つ観点が1つ入っている”投稿文にしてください。

【最重要: 出力規約】
- 出力は JSON 1個のみ。前後に文章、説明、マークダウン、コードフェンス、箇条書き、引用符の追加は禁止。
- JSON以外を1文字でも出したら失敗です。

【文体規約（厳守）】
- 絵文字は禁止。
- 「！」は禁止。例外：toneが"high"のときのみ titleLine に全角「！」を1回だけ許可（他は0回）。
- 「〜してみてね」「見逃せない」「チェック」「気になる…」などの軽い誘導文は禁止。
- 断定しすぎない（事実は本文由来に限定）。誇張・煽りは禁止。
- “バカっぽいテンション”にしない。落ち着いた口語（アナリストのメモ）にする。
- URL誘導はしない。URLは後段でシステムが付けるので、本文中にURLや「リンク」言及を入れない。

【必須要素】
- lines[2] に必ず「実用示唆」を1点入れる（例: 「採用広報の材料になりそう」「研究テーマ探索の入口に使える」など）。
- 固有名詞（組織名・プロジェクト名）は丁寧に（略称より正式名優先）。
- 不確実なら disclaimer に短く（例: "一次ソース未確認"）。不要なら空文字。

【トーン判定】
- high: 新製品/新機能/重大発表など “良い知らせで盛り上げて良い” と判断できるときのみ（ただし軽薄は禁止）
- mid: 通常（研究動向、まとめ、分析、アップデート）
- low: 事故/規制/不祥事/脆弱性/悪材料（淡々と短く）

【出力JSONフォーマット（このキーだけ）】
{
  "titleLine": "20〜35字。落ち着いた見出し。tone=highのみ「！」1回可",
  "lines": [
    "25〜45字。要点1（何が起きた/何の話か）",
    "25〜45字。要点2（背景/意義/どこがポイントか）",
    "25〜45字。実用示唆を必ず含める（例: ○○に使えそう）"
  ],
  "tone": "low|mid|high",
  "disclaimer": "必要な場合のみ。なければ空文字",
  "tags": ["#AI", "#研究"]
}

【タグ規約】
- tagsは最大2個。候補は原則この中から選ぶ: #AI #研究 #生成AI #機械学習 #LLM
- MITの話でも #MIT は原則入れない（AI動向アカウント想定）。どうしても必要なら #研究 を優先。

【Few-shot 例（形式と温度感の参考。内容は真似しない）】
例1（mid）:
{"titleLine":"研究動向: 2025年のまとめが出た","lines":["主要トピックを一気に俯瞰できる内容。","研究成果と社会課題への接続がセットで読める。","企画側なら、次のテーマ探索の入口に使えそう。"],"tone":"mid","disclaimer":"","tags":["#AI","#研究"]}

例2（low）:
{"titleLine":"注意: 規制・リスクの議論が進行","lines":["制度側の動きが具体化しつつある。","現場の運用要件が変わる可能性がある。","コンプラ/セキュリティのチェック項目見直しに使えそう。"],"tone":"low","disclaimer":"一次ソース未確認","tags":["#AI","#研究"]}

例3（high）:
{"titleLine":"新機能の発表が来た！","lines":["新しい機能の概要が公開された。","実装・運用コストの見積りがしやすくなる。","検証環境に入れて、業務導入可否の判断に使えそう。"],"tone":"high","disclaimer":"","tags":["#AI","#LLM"]}
`;

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `タイトル: ${cleanTitle}\n概要: ${cleanSummary}\nリンク: ${item.link}` }
                    ],
                    model: model,
                    response_format: { type: "json_object" }, // Enforce JSON
                    temperature: 0.3 // Lower temperature for more stable/analyst output
                });

                let content = completion.choices[0].message.content;

                // Robust JSON parsing: strip potential code fences if API ignores response_format (rare but safer)
                content = content.replace(/```json/g, '').replace(/```/g, '').trim();

                let composedData;
                try {
                    composedData = JSON.parse(content);
                    // Strict Post-Processing (New)
                    composedData = postProcessComposed(composedData);

                } catch (jsonErr) {
                    logger.error(`JSON Parse Error: ${jsonErr.message}. Raw: ${content}`);
                    // Fallback logic as requested
                    composedData = {
                        titleLine: `MITの研究動向まとめ（2025年）`,
                        lines: [cleanSummary.substring(0, 40), "情報収集の一環として。", "企業側なら、共同研究/採用広報の材料にも使えるかも。"],
                        tone: "mid",
                        disclaimer: "（自動生成に失敗したため簡易表示）",
                        tags: ["#AI", "#研究"]
                    };
                }

                composedItems.push({
                    originalItem: item,
                    composed: composedData
                });
                logger.log(`  -> Tone: ${composedData.tone}, Title: ${composedData.titleLine}`);

            } catch (e) {
                logger.error(`Failed to compose for ${item.title}: ${e.message}`);
            }
        }

        if (composedItems.length > 0) {
            const outPath = path.join(artifactsDir, 'composed_items.json');
            fs.writeFileSync(outPath, JSON.stringify(composedItems, null, 2));
            logger.log(`Saved ${composedItems.length} composed items to ${outPath}`);
        }

        return { composed: composedItems.length };
    }
};
