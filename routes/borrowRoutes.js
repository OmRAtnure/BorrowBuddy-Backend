import express from "express";
import pool from "../config/db.js";
import authenticateUser from "../middleware/authMiddleware.js";
const router = express.Router();

// @route   POST /api/borrow
// @desc    Create a borrow request
// @access  Private
router.post("/", authenticateUser, async (req, res) => {
  try {
    const { item_id } = req.body;
    const borrower_id = req.user.userId;
    console.log(req.user);

    if (!item_id) {
      return res.status(400).json({ message: "Item ID is required" });
    }
    const itemStatus = await pool.query(
      `SELECT available FROM items WHERE id = $1`,
      [item_id]
    );
    
    if (!itemStatus.rows[0].available) {
      return res.status(400).json({ error: "Item is already borrowed" });
    }
    
    // Step 1: Fetch owner_id from items table
    const itemResult = await pool.query(
      "SELECT owner_id FROM items WHERE id = $1",
      [item_id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    const owner_id = itemResult.rows[0].owner_id;

    // Step 2: Insert borrow record
    const result = await pool.query(
      `INSERT INTO borrow (item_id, borrower_id, owner_id, borrowed_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [item_id, borrower_id, owner_id]
    );

    await pool.query(`UPDATE items SET available = false WHERE id = $1`, [item_id]);


    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Borrow route error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// @route   GET /api/borrow
// @desc    Get borrow history for the logged-in user
// @access  Private
// router.get("/", authenticateUser, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     console.log(userId);
//     const result = await pool.query(
//         `SELECT borrow.*, items.name AS item_name, items.description
//          FROM borrow
//          JOIN items ON borrow.item_id = items.id
//          WHERE borrow.borrower_id = $1
//          ORDER BY borrow.borrowed_at DESC`,
//         [userId]
//     );

//     console.log(result.rows);
//     res.json(result.rows);
//   } catch (err) {
//     console.error("Get borrow history error:", err.message);
//     res.status(500).json({ error: "Server error" });
//   }
// });

router.get("/", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Step 1: Get borrowed items with item_name & description
    const result = await pool.query(
      `SELECT borrow.*, items.name AS item_name, items.description
       FROM borrow
       JOIN items ON borrow.item_id = items.id
       WHERE borrow.borrower_id = $1
       ORDER BY borrow.borrowed_at DESC`,
      [userId]
    );

    const borrowedItems = result.rows;

    // Step 2: Fetch images for all item_ids in one go
    const itemIds = borrowedItems.map(item => item.item_id);
    const imagesResult = await pool.query(
      `SELECT item_id, image_url FROM item_images WHERE item_id = ANY($1::int[])`,
      [itemIds]
    );

    const imageMap = {};
    imagesResult.rows.forEach(({ item_id, image_url }) => {
      if (!imageMap[item_id]) imageMap[item_id] = [];
      imageMap[item_id].push(image_url);
    });

    // Step 3: Attach images to each borrowed item
    const finalResult = borrowedItems.map(item => ({
      ...item,
      images: imageMap[item.item_id] || []
    }));
    console.log(finalResult);
    res.json(finalResult);
  } catch (err) {
    console.error("Get borrow history error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


// @route   PATCH /api/borrow/:id/return
// @desc    Mark an item as returned
// @access  Private
router.patch("/:id/return", authenticateUser, async (req, res) => {
  console.log("here");
  try {
    const borrowId = req.params.id;
    const userId = req.user.userId;
    console.log(borrowId);

    // Check if borrow record exists and belongs to the user
    const borrowResult = await pool.query(
      `SELECT * FROM borrow WHERE id = $1 AND borrower_id = $2`,
      [borrowId, userId]
    );

    if (borrowResult.rows.length === 0) {
      return res.status(404).json({ message: "Borrow record not found or unauthorized" });
    }
    const item_id=borrowResult.rows[0].item_id;
    console.log(item_id);
    const updateResult = await pool.query(
      `UPDATE borrow SET returned_at = NOW()
       WHERE id = $1 RETURNING *`,
      [borrowId]
    );
    await pool.query(`UPDATE items SET available = true WHERE id = $1`, [item_id]);


    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error("Return borrow error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


export default router;
