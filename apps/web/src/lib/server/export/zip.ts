// Minimal ZIP reader and writer for Office files (no encryption, no ZIP64, no spanning).
// Enough to write a workbook and to fill in an uploaded one.
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export type ZipEntry = { name: string; data: Buffer };

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** Upper bound for one unpacked entry; Office parts are far smaller. */
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

export class ZipError extends Error {}

/** Reads all entries in central-directory order. Throws `ZipError` on anything unexpected. */
export function readZip(buffer: Buffer): ZipEntry[] {
	// The end record sits in the last 22 bytes plus an optional comment of up to 64 KiB.
	let end = -1;
	for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
		if (buffer.readUInt32LE(i) === END) {
			end = i;
			break;
		}
	}
	if (end < 0) throw new ZipError('not a zip file');
	const count = buffer.readUInt16LE(end + 10);
	let offset = buffer.readUInt32LE(end + 16);
	const entries: ZipEntry[] = [];
	let total = 0;
	for (let n = 0; n < count; n++) {
		if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL) {
			throw new ZipError('broken central directory');
		}
		const flags = buffer.readUInt16LE(offset + 8);
		const method = buffer.readUInt16LE(offset + 10);
		const compressedSize = buffer.readUInt32LE(offset + 20);
		const size = buffer.readUInt32LE(offset + 24);
		const nameLength = buffer.readUInt16LE(offset + 28);
		const extraLength = buffer.readUInt16LE(offset + 30);
		const commentLength = buffer.readUInt16LE(offset + 32);
		const localOffset = buffer.readUInt32LE(offset + 42);
		const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
		offset += 46 + nameLength + extraLength + commentLength;

		if (flags & 1) throw new ZipError('encrypted entries are not supported');
		if (size > MAX_ENTRY_BYTES || (total += size) > 4 * MAX_ENTRY_BYTES) {
			throw new ZipError('entry too large');
		}
		if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) {
			throw new ZipError('broken local header');
		}
		const start =
			localOffset +
			30 +
			buffer.readUInt16LE(localOffset + 26) +
			buffer.readUInt16LE(localOffset + 28);
		const raw = buffer.subarray(start, start + compressedSize);
		if (raw.length !== compressedSize) throw new ZipError('truncated entry');
		let data: Buffer;
		if (method === 0) data = Buffer.from(raw);
		else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
		else throw new ZipError('unsupported compression');
		if (data.length !== size) throw new ZipError('size mismatch');
		entries.push({ name, data });
	}
	return entries;
}

/** Writes deflated entries with a fixed timestamp, so equal input gives equal bytes. */
export function writeZip(entries: ZipEntry[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	// 1980-01-01 00:00 in DOS format.
	const dosTime = 0;
	const dosDate = (0 << 9) | (1 << 5) | 1;
	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const compressed = deflateRawSync(entry.data);
		const crc = crc32(entry.data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(LOCAL, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(8, 8);
		local.writeUInt16LE(dosTime, 10);
		local.writeUInt16LE(dosDate, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(entry.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		locals.push(local, name, compressed);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(CENTRAL, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(8, 10);
		central.writeUInt16LE(dosTime, 12);
		central.writeUInt16LE(dosDate, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(entry.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, name);

		offset += local.length + name.length + compressed.length;
	}
	const directory = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(END, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, directory, end]);
}
