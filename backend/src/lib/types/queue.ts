

enum Direction {
  FIFO,
  LIFO
}

export class Queue<QueueItem> {
  constructor(
    readonly direction: Direction = Direction.FIFO,
    protected items: QueueItem[] = []
  ) {}

  get size() {
    return this.items.length;
  }

  /**
   * Adds an item to the queue. The position of the item depends on the queue's direction (FIFO or LIFO).
   * @param item The item to be added to the queue.
   * @returns void
   */
  enqueue(item: QueueItem) {
    switch(this.direction) {
      case Direction.FIFO:
        this.items.push(item);
        break;
      case Direction.LIFO:
        this.items.unshift(item);
        break;
    }
  }

  /**
   * Removes the next item from the queue based on its direction (FIFO or LIFO) and returns it.
   * If the queue is empty, it returns undefined.
   * @returns The next item in the queue or undefined if the queue is empty.
   */
  dequeue() {
    switch(this.direction) {
      case Direction.FIFO:
        return this.items.shift();
      case Direction.LIFO:
        return this.items.pop();
    }
  }

  /**
   * Allows access to view the queue without affecting it's state
   *   If an index is provided, it returns the item at that index without modifying the queue. 
   *   If no index is provided, it returns a copy of the entire queue.
   * @param index Optional index to peek at a specific item in the queue. If not provided, the entire queue is returned.
   * @returns The item at the specified index or a copy of the entire queue if no index is provided. Throws an error if the index is out of bounds.
   */
  peek(index: number) {
    if (!index) {
      // Return a copy of the queue if no index is provided
      return [...this.items];
    }
    
    // Protect against out-of-bounds access
    if (index < 0 || index >= this.items.length) {
      throw new RangeError('Index out of bounds');
    }

    // Return the item at the specified index without modifying the queue
    return this.items[index];
  }

  /**
   * Checks if the queue is empty.
   * @returns {boolean} True if the queue is empty, false otherwise.
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Clears all items from the queue, resetting it to an empty state.
   * @returns void
   * @remarks This method modifies the queue in place by setting the items array to an empty array. 
   *          After calling this method, the size of the queue will be 0 and any subsequent calls to peek or dequeue will indicate that the queue is empty.
   */
  clear() {
    this.items = [];
  }
}