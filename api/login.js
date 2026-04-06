// api/login.js

const express = require("express");

const router = express.Router();

const bcrypt = require("bcrypt");

const getDriver = require("../lib/neo4j");
 
router.post("/", async (req, res) => {

  // Add CORS headers specifically for this route

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight

  if (req.method === "OPTIONS") {

    return res.status(200).end();

  }

  const { username, password } = req.body;

  // Validate input

  if (!username || !password) {

    return res.status(400).json({

      success: false,

      message: "Username and password are required"

    });

  }

  const driver = getDriver();

  const session = driver.session();

  try {

    console.log(`📡 Login attempt for user: ${username}`);

    const result = await session.run(

      `MATCH (u:User {username: $username})

       RETURN u.username AS username,

              u.passwordHash AS hash,

              u.role AS role,

              u.name AS name,

              u.assignedClients AS assignedClients`,

      { username }

    );

    if (result.records.length === 0) {

      console.log(`❌ User ${username} not found`);

      return res.status(401).json({

        success: false,

        message: "Invalid credentials"

      });

    }

    const record = result.records[0];

    const hash = record.get("hash");

    const isValid = await bcrypt.compare(password, hash);

    if (!isValid) {

      console.log(`❌ Invalid password for ${username}`);

      return res.status(401).json({

        success: false,

        message: "Invalid credentials"

      });

    }

    const userName = record.get("name") || username;

    const assignedClients = record.get("assignedClients") || [];

    const firstClient = assignedClients.length > 0 ? assignedClients[0] : null;

    console.log(`✅ Login successful: ${username}`);

    res.json({

      success: true,

      message: "Login successful",

      user: {

        username: record.get("username"),

        name: userName,

        role: record.get("role"),

        assignedClients: assignedClients,

        clientName: firstClient

      }

    });

  } catch (err) {

    console.error("❌ Login error:", err);

    res.status(500).json({

      success: false,

      message: "Server error: " + err.message

    });

  } finally {

    await session.close();

  }

});
 
module.exports = router;
 
