const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
 
// Import the shared driver helper
const getDriver = require("../lib/neo4j");
 
/**
 * =================================================
 * POST – User Login
 * =================================================
 */
router.post("/", async (req, res) => {
  const { username, password } = req.body;
 
  // Get driver and create session
  const driver = getDriver();
  const session = driver.session();
 
  try {
    console.log(`\n📡 POST /api/login - Login attempt for user: ${username}`);
   
    // UPDATE: Use assignedClients (array) instead of assignedClient (singular)
    const result = await session.run(
      `MATCH (u:User {username: $username})
       RETURN u.username AS username,
              u.passwordHash AS hash,
              u.role AS role,
              u.name AS name,
              u.assignedClients AS assignedClients`,  // ← CHANGED to assignedClients (plural)
      { username }
    );
 
    // Check if user exists
    if (result.records.length === 0) {
      console.log(`❌ Login failed: User ${username} not found`);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }
 
    const record = result.records[0];
    const hash = record.get("hash");
   
    // Verify password
    const isValid = await bcrypt.compare(password, hash);
 
    if (!isValid) {
      console.log(`❌ Login failed: Invalid password for user ${username}`);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }
 
    // Get name - if no name field exists, use username as fallback
    const userName = record.get("name") || username;
   
    // Get assigned clients array
    const assignedClients = record.get("assignedClients") || [];
   
    // For backward compatibility, also provide clientName (first client if exists)
    const firstClient = assignedClients.length > 0 ? assignedClients[0] : null;
 
    // Login successful
    console.log(`✅ Login successful for user: ${username} (Role: ${record.get("role")})`);
    console.log(`   Display name: ${userName}`);
    console.log(`   Assigned clients: ${assignedClients.join(', ') || 'None'}`);
   
    res.json({
      success: true,
      message: "Login successful",
      user: {
        username: record.get("username"),
        name: userName,
        role: record.get("role"),
        assignedClients: assignedClients,  // ← Full array for multi-client support
        clientName: firstClient            // ← First client for backward compatibility
      }
    });
 
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  } finally {
    await session.close();
  }
});
 
module.exports = router;
 
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
 
// Import the shared driver helper
const getDriver = require("../lib/neo4j");
 
const VALID_ROLES = ["Admin", "Recruiter", "Interviewer", "Client Interviewer", "Employee"];
 
/**
 * =================================================
 * GET – Get All Users (Admin only)
 * =================================================
 */
router.get("/", async (req, res) => {
  console.log("\n📡 GET /api/users - Fetching all users");
 
  const driver = getDriver();
  const session = driver.session();
 
  try {
    console.log("🔍 Executing Neo4j query...");
   
    const result = await session.run(
      `MATCH (u:User)
       RETURN u.username as username,
              u.role as role,
              u.assignedClients as assignedClients,
              u.createdAt as createdAt
       ORDER BY u.createdAt DESC`
    );
 
    const users = result.records.map(record => {
      const username = record.get("username");
      const role = record.get("role");
      const assignedClients = record.get("assignedClients") || [];
      const createdAt = record.get("createdAt");
     
      return {
        username: username,
        name: username,
        role: role,
        assignedClients: assignedClients,
        clientName: assignedClients.length > 0 ? assignedClients[0] : null,
        createdAt: createdAt ? new Date(createdAt).toISOString() : null
      };
    });
 
    console.log("✅ Users fetched successfully");
 
    res.json({
      success: true,
      users: users
    });
 
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: err.message
    });
  } finally {
    await session.close();
  }
});
 
/**
 * =================================================
 * POST – Create New User (Admin only)
 * =================================================
 */
router.post("/", async (req, res) => {
  console.log("\n📡 POST /api/users - Creating new user");
  console.log("Request body:", { ...req.body, password: "[HIDDEN]" });
 
  const driver = getDriver();
  const session = driver.session();
 
  try {
    const { username, password, role, assignedClient } = req.body;
 
    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, password and role are required"
      });
    }
 
    // Check if username exists
    const checkResult = await session.run(
      "MATCH (u:User {username: $username}) RETURN u",
      { username }
    );
 
    if (checkResult.records.length > 0) {
      console.log(`❌ Username already exists: ${username}`);
      return res.status(400).json({
        success: false,
        message: "Username already exists"
      });
    }
 
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
 
    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles: ${VALID_ROLES.join(", ")}`
      });
    }
 
    // Prepare user data
    const userData = {
      username,
      passwordHash,
      role,
      createdAt: new Date().toISOString()
    };
 
    // If role is Interviewer or Client Interviewer, initialize assignedClients as an array
    if (role === "Interviewer" || role === "Client Interviewer") {
      if (assignedClient) {
        userData.assignedClients = Array.isArray(assignedClient) ? assignedClient : [assignedClient];
      } else {
        userData.assignedClients = [];
      }
    } else {
      userData.assignedClients = [];
    }
 
    // Create user with assignedClients as array
    const result = await session.run(
      `
      CREATE (u:User {
        username: $username,
        passwordHash: $passwordHash,
        role: $role,
        assignedClients: $assignedClients,
        createdAt: datetime($createdAt)
      })
      RETURN u.username as username, u.role as role, u.assignedClients as assignedClients, u.createdAt as createdAt
      `,
      {
        username,
        passwordHash,
        role,
        assignedClients: userData.assignedClients || [],
        createdAt: userData.createdAt
      }
    );
 
    const createdUser = result.records[0];
    const createdUsername = createdUser.get("username");
    const createdRole = createdUser.get("role");
    const createdClients = createdUser.get("assignedClients") || [];
    const createdDate = createdUser.get("createdAt");
 
    console.log(`✅ User created successfully: ${createdUsername} (${createdRole})`);
 
    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        username: createdUsername,
        name: createdUsername,
        role: createdRole,
        assignedClients: createdClients,
        clientName: createdClients.length > 0 ? createdClients[0] : null,
        createdAt: createdDate ? createdDate.toString() : null
      }
    });
 
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: err.message
    });
  } finally {
    await session.close();
  }
});
 
/**
 * =================================================
 * PUT – Update User (Role and Assigned Client)
 * =================================================
 */
router.put("/:username", async (req, res) => {
  console.log(`\n📡 PUT /api/users/${req.params.username} - Updating user`);
 
  const driver = getDriver();
  const session = driver.session();
  const { username } = req.params;
  const { role, assignedClient } = req.body;
 
  try {
    console.log(`📝 Updating user: ${username}`);
    console.log(`   New role: ${role}`);
    if (assignedClient) console.log(`   New assigned client: ${assignedClient}`);
 
    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required"
      });
    }
 
    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles: ${VALID_ROLES.join(", ")}`
      });
    }
 
    // Check if user exists
    const checkResult = await session.run(
      "MATCH (u:User {username: $username}) RETURN u",
      { username }
    );
 
    if (!checkResult.records.length) {
      console.log(`❌ User ${username} not found`);
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
 
    // Build update query based on role and assignedClients
    let updateQuery = `MATCH (u:User {username: $username}) SET u.role = $role`;
    const params = { username, role };
 
    // If role is Interviewer or Client Interviewer
    if (role === "Interviewer" || role === "Client Interviewer") {
      if (assignedClient) {
        const clientsToAssign = Array.isArray(assignedClient) ? assignedClient : [assignedClient];
        updateQuery += `, u.assignedClients = $assignedClients`;
        params.assignedClients = clientsToAssign;
        console.log(`   Setting assigned clients: ${clientsToAssign.join(', ')}`);
      } else {
        updateQuery += `, u.assignedClients = []`;
        console.log(`   Setting assigned clients to empty array`);
      }
    } else {
      updateQuery += `, u.assignedClients = []`;
      console.log(`   Clearing assigned clients (role is ${role})`);
    }
 
    // Execute update
    await session.run(updateQuery, params);
   
    // Fetch updated user data
    const result = await session.run(
      `
      MATCH (u:User {username: $username})
      RETURN u.username as username,
             u.role as role,
             u.assignedClients as assignedClients,
             u.createdAt as createdAt
      `,
      { username }
    );
 
    const updatedUser = result.records[0];
    const updatedUsername = updatedUser.get("username");
    const updatedRole = updatedUser.get("role");
    const updatedClients = updatedUser.get("assignedClients") || [];
    const updatedDate = updatedUser.get("createdAt");
 
    console.log(`✅ User ${username} updated successfully to role: ${updatedRole}`);
 
    res.json({
      success: true,
      message: "User updated successfully",
      user: {
        username: updatedUsername,
        name: updatedUsername,
        role: updatedRole,
        assignedClients: updatedClients,
        clientName: updatedClients.length > 0 ? updatedClients[0] : null,
        createdAt: updatedDate ? updatedDate.toString() : null
      }
    });
 
  } catch (err) {
    console.error("❌ Error updating user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: err.message
    });
  } finally {
    await session.close();
  }
});
 
/**
 * =================================================
 * DELETE – Delete User (Admin only)
 * =================================================
 */
router.delete("/:username", async (req, res) => {
  console.log(`\n📡 DELETE /api/users/${req.params.username} - Deleting user`);
 
  const driver = getDriver();
  const session = driver.session();
  const { username } = req.params;
 
  try {
    console.log(`🔍 Checking if user ${username} exists`);
 
    // Check if user exists
    const checkResult = await session.run(
      "MATCH (u:User {username: $username}) RETURN u",
      { username }
    );
 
    if (!checkResult.records.length) {
      console.log(`❌ User ${username} not found`);
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
 
    // Delete user
    await session.run(
      "MATCH (u:User {username: $username}) DELETE u",
      { username }
    );
 
    console.log(`✅ User ${username} deleted successfully`);
 
    res.json({
      success: true,
      message: "User deleted successfully"
    });
 
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: err.message
    });
  } finally {
    await session.close();
  }
});
 
module.exports = router;
 
