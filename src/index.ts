
interface Entry<K, V> {
  readonly key: K;        // handle to entry's own key
  val:  V;                // user-supplied cached value
  exp:  number;           // timestamp at which entry expires, in ms
  prev: Entry<K, V>|null;
  next: Entry<K, V>|null;
}

const def = {
  ttl: 1000,    // default entry TTL in ms
  max: Infinity // max number of entries in cache
};

export type Opts = typeof def;

export class TTLCache<K = any, V = any> {
  private oldest: Entry<K, V>|null = null;
  private newest: Entry<K, V>|null = null;
  private max: number;
  private readonly cache = new Map<K, Entry<K, V>>(); // preserves insert order
  private readonly ttl: number;

  constructor(opt?: Partial<Opts>) {
    const { ttl, max } = TTLCache.makeOpt(def, opt);

    if (ttl !== 0 && !(ttl > 0)) {
      throw new Error(`invalid TTL (${ttl})`);
    }
    else if (!(max > 1)) {
      throw new Error(`invalid max (${max})`);
    }

    this.ttl = ttl;
    this.max = max;
  }

  get size() {
    // includes expired
    return this.cache.size;
  }

  get keys() {
    // includes expired
    return Array.from(this.cache.keys());
  }

  has(key: K) {
    // includes expired
    return this.cache.has(key);
  }

  get(key: K) {
    const entry = this.cache.get(key);

    if (entry) {
      if (TTLCache.isExpired(entry)) {
        this.evictEntry(entry);

        return undefined;
      }
      else {
        this.bumpAge(entry);

        return entry.val;
      }
    }
    else {
      return undefined;
    }
  }

  set(key: K, val: V) {
    const prev = this.cache.get(key);

    if (prev) {
      prev.val = val;
      prev.exp = Date.now() + this.ttl; // refresh

      this.bumpAge(prev);
    }
    else {
      if (this.cache.size === this.max) {
        this.evictEntry(this.oldest!);
      }

      const entry: Entry<K, V> = {
        key,
        val,
        exp:  Date.now() + this.ttl,
        prev: null,
        next: null
      };

      this.bumpAge(entry);
    }
  }

  delete(key: K) {
    const entry = this.cache.get(key);

    if (entry) {
      this.evictEntry(entry);

      return true;
    }

    return false;
  }

  cleanup() {
    while (this.oldest) {
      if (TTLCache.isExpired(this.oldest)) {
        this.evictEntry(this.oldest);
      }
      else {
        // remaining entries are newer
        break;
      }
    }
  }

  resize(max: number) {
    if (!(max > 1)) {
      throw new Error(`invalid max (${max})`);
    }

    const shrinkBy = this.max - max;

    if (shrinkBy > 0) {
      let drop = shrinkBy - (this.max - this.cache.size);

      while (drop > 0) {
        this.evictEntry(this.oldest!);

        drop--;
      }
    }

    this.max = max;
  }

  clear() {
    this.cache.clear();

    this.oldest = null;
    this.newest = null;
  }

  debug() {
    const entries: string[] = [];

    this.cache.forEach(e => entries.push(`[${e.key}:${e.val}]`));

    return entries.join(' -> ');
  }

  private bumpAge(entry: Entry<K, V>) {
    // reset insertion order
    this.cache.delete(entry.key); // maybe noop
    this.cache.set(entry.key, entry);

    if (entry === this.newest) {
      // already newest or only entry
      return;
    }
    else if (!this.oldest || !this.newest) {
      // set only entry
      this.oldest = entry;
      this.newest = entry;
    }
    else {
      if (entry === this.oldest) {
        entry.next!.prev = null;

        this.oldest = entry.next;
      }

      entry.prev = this.newest;
      entry.next = null;

      this.newest.next = entry;
      this.newest = entry;
    }
  }

  private evictEntry(entry: Entry<K, V>) {
    this.cache.delete(entry.key);

    if (!entry.prev && !entry.next) {
      // only entry
      this.oldest = null;
      this.newest = null;
    }
    else {
      if (entry.prev) {
        entry.prev.next = entry.next; // maybe null

        if (entry === this.newest) {
          this.newest = entry.prev;
        }
      }

      if (entry.next) {
        entry.next.prev = entry.prev; // maybe null

        if (entry === this.oldest) {
          this.oldest = entry.next;
        }
      }
    }
  }

  private static isExpired<K, V>(entry: Entry<K, V>) {
    // entry is valid during same ms
    // NOTE: flaky async results with very small TTL
    return entry.exp < Date.now();
  }

  private static makeOpt<T>(defs: T, opts = {}): T {
    const merged = { ...defs as any };

    for (const key in opts) {
      const val = (opts as any)[key];

      if (val !== undefined) {
        merged[key] = val;
      }
    }

    return merged;
  }
}
