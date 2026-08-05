const express = require('express');
const { pool } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireLogin, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT chapters.id, chapters.title, chapters.created_at,
             COUNT(votes.id) AS vote_count
      FROM chapters
      LEFT JOIN votes ON votes.chapter_id = chapters.id
      GROUP BY chapters.id
      ORDER BY chapters.created_at DESC
    `);
    res.render('index', { user: req.user, chapters: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/chapters/:id', requireLogin, async (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(404).send('Chapter not found.');
  }

  try {
    const result = await pool.query('SELECT * FROM chapters WHERE id = $1', [id]);
    const chapter = result.rows[0];

    if (!chapter) {
      return res.status(404).send('Chapter not found.');
    }

    // Paragraphs are separated by a blank line. Splitting them out here
    // means each one can be rendered as its own element, so comments can
    // attach to a specific one (matching comments.paragraph_index).
    const paragraphs = chapter.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const commentsResult = await pool.query(
      'SELECT paragraph_index, username, text, created_at FROM comments WHERE chapter_id = $1 ORDER BY paragraph_index, created_at',
      [id]
    );

    // Group comments by which paragraph they belong to, so the view can
    // just look up commentsByParagraph[index] for each paragraph.
    const commentsByParagraph = {};
    for (const comment of commentsResult.rows) {
      if (!commentsByParagraph[comment.paragraph_index]) {
        commentsByParagraph[comment.paragraph_index] = [];
      }
      commentsByParagraph[comment.paragraph_index].push(comment);
    }

    const voteCountResult = await pool.query(
      'SELECT COUNT(*) FROM votes WHERE chapter_id = $1',
      [id]
    );
    const voteCount = Number(voteCountResult.rows[0].count);

    const userVoteResult = await pool.query(
      'SELECT 1 FROM votes WHERE chapter_id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    const hasVoted = userVoteResult.rows.length > 0;

    res.render('chapter', {
      user: req.user,
      chapter,
      paragraphs,
      commentsByParagraph,
      voteCount,
      hasVoted,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/chapters/:id/vote', requireLogin, async (req, res, next) => {
  const chapterId = Number(req.params.id);

  if (!Number.isInteger(chapterId)) {
    return res.status(404).send('Chapter not found.');
  }

  try {
    const chapterResult = await pool.query('SELECT id FROM chapters WHERE id = $1', [chapterId]);
    if (chapterResult.rows.length === 0) {
      return res.status(404).send('Chapter not found.');
    }

    // user_id always comes from req.user (the logged-in session), never
    // from the form, so nobody can vote as someone else.
    const existing = await pool.query(
      'SELECT id FROM votes WHERE chapter_id = $1 AND user_id = $2',
      [chapterId, req.user.id]
    );

    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM votes WHERE chapter_id = $1 AND user_id = $2', [
        chapterId,
        req.user.id,
      ]);
    } else {
      await pool.query('INSERT INTO votes (chapter_id, user_id) VALUES ($1, $2)', [
        chapterId,
        req.user.id,
      ]);
    }

    res.redirect(`/chapters/${chapterId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/chapters/:id/comments', requireLogin, async (req, res, next) => {
  const chapterId = Number(req.params.id);
  const paragraphIndex = Number(req.body.paragraph_index);
  const text = (req.body.text || '').trim();

  if (!Number.isInteger(chapterId) || !Number.isInteger(paragraphIndex) || paragraphIndex < 0 || !text) {
    return res.status(400).send('Invalid comment.');
  }

  try {
    const chapterResult = await pool.query('SELECT id FROM chapters WHERE id = $1', [chapterId]);
    if (chapterResult.rows.length === 0) {
      return res.status(404).send('Chapter not found.');
    }

    // username always comes from the logged-in session, never from the
    // form, so nobody can post a comment as someone else.
    await pool.query(
      'INSERT INTO comments (chapter_id, paragraph_index, username, text) VALUES ($1, $2, $3, $4)',
      [chapterId, paragraphIndex, req.user.username, text]
    );

    res.redirect(`/chapters/${chapterId}#paragraph-${paragraphIndex}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
