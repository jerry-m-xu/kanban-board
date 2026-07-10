const express = require("express");
const store = require("../store");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(store.getAll());
});

router.get("/:id", (req, res) => {
  const item = store.getById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.json(item);
});

router.post("/", (req, res) => {
  const { name, description } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required and must be a string" });
  }

  const item = store.create({ name, description });
  res.status(201).json(item);
});

router.put("/:id", (req, res) => {
  const { name, description } = req.body;

  if (name !== undefined && typeof name !== "string") {
    return res.status(400).json({ error: "name must be a string" });
  }

  const item = store.update(req.params.id, { name, description });
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.json(item);
});

router.delete("/:id", (req, res) => {
  const deleted = store.remove(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.status(204).send();
});

module.exports = router;
