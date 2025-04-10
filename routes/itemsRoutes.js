import express from "express";
import pool from "../config/db.js";
import authenticateUser from "../middleware/authMiddleware.js";

const router = express.Router();

/** 
 * 📌 Add a New Item (Owner Only)
 */
router.post("/items", authenticateUser, async (req, res) => {
    const { name, description, category, price, images } = req.body;
    const owner_id = req.user.userId; // Extract owner_id from authenticated user

    try {
        const itemResult = await pool.query(
            `INSERT INTO items (owner_id, name, description, category, price, available)
             VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
            [owner_id, name, description, category, price]
        );

        const itemId = itemResult.rows[0].id;

        if (images && images.length > 0) {
            const imageQueries = images.map(imageUrl =>
                pool.query(`INSERT INTO item_images (item_id, image_url) VALUES ($1, $2)`, [itemId, imageUrl])
            );
            await Promise.all(imageQueries);
        }

        res.status(201).json({ success: true, itemId });

    } catch (error) {
        console.error("Error adding item:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/** 
 * 📌 Get All Available Items with Images
 */
router.get("/items", async (req, res) => {
    console.log("ion fetch item");
    try {
        const itemsResult = await pool.query("SELECT * FROM items WHERE available = true");
        const items = itemsResult.rows;

        const itemsWithImages = await Promise.all(
            items.map(async item => {
                const imagesResult = await pool.query("SELECT image_url FROM item_images WHERE item_id = $1", [item.id]);
                item.images = imagesResult.rows.map(row => row.image_url);
                return item;
            })
        );

        res.status(200).json(itemsWithImages);
    } catch (error) {
        console.error("Error fetching items:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/** 
 * 📌 Get a Single Item with Images
 */
router.get("/items/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const itemResult = await pool.query("SELECT * FROM items WHERE id = $1", [id]);

        if (itemResult.rows.length === 0) {
            return res.status(404).json({ error: "Item not found" });
        }

        const imagesResult = await pool.query("SELECT image_url FROM item_images WHERE item_id = $1", [id]);

        const item = itemResult.rows[0];
        item.images = imagesResult.rows.map(row => row.image_url);
        console.log(item);
        res.status(200).json(item);
    } catch (error) {
        console.error("Error fetching item:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/** 
 * 📌 Delete an Item (Only Owner Can Delete)
 */
router.delete("/items/:id", authenticateUser, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        const itemCheck = await pool.query("SELECT owner_id FROM items WHERE id = $1", [id]);
        if (itemCheck.rows.length === 0) {
            return res.status(404).json({ error: "Item not found" });
        }

        if (itemCheck.rows[0].owner_id !== userId) {
            return res.status(403).json({ error: "Unauthorized: You do not own this item" });
        }

        await pool.query("DELETE FROM items WHERE id = $1", [id]);

        res.status(200).json({ success: true, message: "Item deleted successfully" });
    } catch (error) {
        console.error("Error deleting item:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/** 
 * 📌 Update Item Details (Only Owner Can Update)
 */
router.put("/items/:id", authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, description, category, price, available } = req.body;
    const userId = req.user.userId;

    try {
        const itemCheck = await pool.query("SELECT owner_id FROM items WHERE id = $1", [id]);
        if (itemCheck.rows.length === 0) {
            return res.status(404).json({ error: "Item not found" });
        }

        if (itemCheck.rows[0].owner_id !== userId) {
            return res.status(403).json({ error: "Unauthorized: You do not own this item" });
        }

        const updateResult = await pool.query(
            `UPDATE items SET name = $1, description = $2, category = $3, price = $4, available = $5
             WHERE id = $6 RETURNING *`,
            [name, description, category, price, available, id]
        );

        res.status(200).json({ success: true, updatedItem: updateResult.rows[0] });
    } catch (error) {
        console.error("Error updating item:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/** 
 * 📌 Route: Get Items by Category (Only Available Items)
 * Example: GET /api/items/category/Electronics
 */
router.get("/category/:category", async (req, res) => {
    const { category } = req.params;

    try {
        // Fetch items from a specific category that are available
        const itemsResult = await pool.query(
            "SELECT * FROM items WHERE category = $1 AND available = true",
            [category]
        );
        const items = itemsResult.rows;

        // Fetch images for each item
        const itemsWithImages = await Promise.all(
            items.map(async item => {
                const imagesResult = await pool.query(
                    "SELECT image_url FROM item_images WHERE item_id = $1",
                    [item.id]
                );
                item.images = imagesResult.rows.map(row => row.image_url);
                return item;
            })
        );

        res.status(200).json(itemsWithImages);
    } catch (error) {
        console.error("Error fetching items by category:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


/** 
 * 📌 Get Items Rented Out by the Current User (Owner View)
 */
router.get("/rented", authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;

        const rentedItems = await pool.query(
            `SELECT items.id, items.name, items.description, items.available, 
                    borrow.borrower_id, users.name AS borrower_name, 
                    borrow.borrowed_at, borrow.returned_at
             FROM items
             JOIN borrow ON items.id = borrow.item_id
             JOIN users ON borrow.borrower_id = users.id
             WHERE items.owner_id = $1 AND items.available = false`,
            [userId]
        );

        res.status(200).json(rentedItems.rows);
    } catch (error) {
        console.error("Get rented items error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * 📌 Get Items Listed by the Current User (Owner View)
 */
router.get("/listed", authenticateUser, async (req, res) => {
    // const { ownerId } = req.params;
    const userId = req.user.userId;

    // Prevent users from accessing others' listed items
    

    try {
        const itemsResult = await pool.query(
            "SELECT * FROM items WHERE owner_id = $1",
            [userId]
        );
        const items = itemsResult.rows;

        const itemsWithImages = await Promise.all(
            items.map(async item => {
                const imagesResult = await pool.query(
                    "SELECT image_url FROM item_images WHERE item_id = $1",
                    [item.id]
                );
                item.images = imagesResult.rows.map(row => row.image_url);
                return item;
            })
        );

        res.status(200).json(itemsWithImages);
        console.log(itemsWithImages);
    } catch (error) {
        console.error("Error fetching listed items:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
