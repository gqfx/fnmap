/**
 * Sample TypeScript file for testing
 */

interface User {
  name: string;
  age: number;
}

/**
 * User management class
 */
class UserManager {
  private users: User[] = [];

  /**
   * Add a user
   */
  addUser(user: User): void {
    this.users.push(user);
  }

  /**
   * Get user by name
   */
  getUser(name: string): User | undefined {
    return this.users.find(u => u.name === name);
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return this.users;
  }
}

export { UserManager };
export type { User };
