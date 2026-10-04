package workflow

import (
	"context"
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/awslabs/filemoverexpress/constants"
	"github.com/awslabs/filemoverexpress/core/checksums"
	"github.com/awslabs/filemoverexpress/utils/mhl"
)

// mhlFilePerm is the permission for a written MHL file (owner read/write).
const mhlFilePerm = 0o600

type (
	// ChecksumExecutor runs a Checksum step: it hashes the step's local sources with the
	// selected algorithm and optionally writes a Media Hash List (format doc "The
	// Checksum step payload"). The checksummer factory is injected (defaulting to
	// checksums.NewChecksummer) so the executor is tested with a fake over a temp dir and
	// never depends on the real hashing workers.
	ChecksumExecutor struct {
		newChecksummer func(constants.ChecksumAlgorithm) (checksums.FileMoverChecksummer, error)
	}

	// fileHash pairs a file path with its computed hash, used to build the MHL.
	fileHash struct {
		path string
		hash string
	}

	// dirSkip decides, for a directory encountered during a walk rooted at root, whether
	// to descend (nil) or skip it (filepath.SkipDir). recurseAll descends everywhere;
	// topLevelSkip skips every directory below the root.
	dirSkip func(root, path string) error
)

// NewChecksumExecutor builds a ChecksumExecutor wired to the real checksummer factory.
func NewChecksumExecutor() *ChecksumExecutor {
	return &ChecksumExecutor{newChecksummer: checksums.NewChecksummer}
}

// Execute hashes every file under the step's sources (recursing into directories unless
// recursive is false) and, when writeMhl is set, writes an MHL to mhlOutput. It fails if
// sources is empty, a source is unreadable, the checksummer errors, or the MHL cannot be
// written. Context cancellation aborts the walk.
func (c *ChecksumExecutor) Execute(ctx context.Context, step Step) error {
	sources := withStringSlice(step.With, "sources")
	if len(sources) == 0 {
		return fmt.Errorf("workflow: checksum step %s has no sources", step.ID)
	}
	csum, err := c.newChecksummer(checksumAlgorithm(withString(step.With, "algorithm")))
	if err != nil {
		return fmt.Errorf("workflow: checksum step %s: %w", step.ID, err)
	}

	skip := topLevelSkip
	if withBool(step.With, "recursive", true) {
		skip = recurseAll
	}
	files, err := collectFiles(ctx, sources, skip)
	if err != nil {
		return fmt.Errorf("workflow: checksum step %s: %w", step.ID, err)
	}

	hashes, err := hashAll(ctx, csum, files)
	if err != nil {
		return fmt.Errorf("workflow: checksum step %s: %w", step.ID, err)
	}

	return c.maybeWriteMHL(step, hashes)
}

// maybeWriteMHL writes the MHL when the step requests it. mhlOutput is required when
// writeMhl is true (the schema enforces this too; guarded defensively here).
func (*ChecksumExecutor) maybeWriteMHL(step Step, hashes []fileHash) error {
	if !withBool(step.With, "writeMhl", false) {
		return nil
	}
	out := withString(step.With, "mhlOutput")
	if out == "" {
		return fmt.Errorf("workflow: checksum step %s has writeMhl but no mhlOutput", step.ID)
	}
	if err := writeMHL(out, withString(step.With, "algorithm"), hashes); err != nil {
		return fmt.Errorf("workflow: checksum step %s writing mhl: %w", step.ID, err)
	}
	return nil
}

// recurseAll descends into every directory.
func recurseAll(_, _ string) error { return nil }

// topLevelSkip descends only the root directory, skipping its subdirectories.
func topLevelSkip(root, path string) error {
	if path != root {
		return filepath.SkipDir
	}
	return nil
}

// collectFiles expands the sources into a flat list of file paths: a file source is taken
// as-is, a directory source is walked using skip to decide recursion. An unreadable
// source is an error.
func collectFiles(ctx context.Context, sources []string, skip dirSkip) ([]string, error) {
	var files []string
	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return nil, err
		}
		if !info.IsDir() {
			files = append(files, src)
			continue
		}
		dirFiles, err := walkDir(ctx, src, skip)
		if err != nil {
			return nil, err
		}
		files = append(files, dirFiles...)
	}
	return files, nil
}

// walkDir returns the file paths under dir, consulting skip for each directory to decide
// recursion. Context cancellation stops the walk.
func walkDir(ctx context.Context, dir string, skip dirSkip) ([]string, error) {
	var files []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			// COVERAGE: justified-unreachable defensive branch. WalkDir passes a non-nil
			// err only when it cannot lstat an entry it already discovered (a mid-walk
			// permission or race error); forcing that portably (as root, on Windows, in
			// CI) needs filesystem fault injection, so it is not exercised. The error is
			// propagated rather than swallowed. See the implementation plan section 7.
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if d.IsDir() {
			return skip(dir, path)
		}
		files = append(files, path)
		return nil
	})
	return files, err
}

// hashAll computes the hash of every file, returning early on the first error or on
// context cancellation.
func hashAll(ctx context.Context, csum checksums.FileMoverChecksummer, files []string) ([]fileHash, error) {
	hashes := make([]fileHash, 0, len(files))
	for _, f := range files {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		h, err := csum.ChecksumFile(f)
		if err != nil {
			return nil, err
		}
		hashes = append(hashes, fileHash{path: f, hash: h})
	}
	return hashes, nil
}

// checksumAlgorithm maps a workflow `algorithm` string (md5|xxhash|xxhash64|xxh3) to the
// internal ChecksumAlgorithm constant, defaulting to xxh3 for an empty or unrecognized
// value (matching the format doc default and NewChecksummer's own fallback).
func checksumAlgorithm(name string) constants.ChecksumAlgorithm {
	switch name {
	case "md5":
		return constants.AlgorithmMD5
	case "xxhash":
		return constants.AlgorithmXXHash
	case "xxhash64":
		return constants.AlgorithmXXHash64
	case "xxh3":
		return constants.AlgorithmXXH3
	default:
		return constants.AlgorithmXXH3
	}
}

// writeMHL marshals the computed hashes into an MHL (reusing the project's mhl.HashList
// type so the output is loadable by LoadMHLFile) and writes it to out. The hash is placed
// in the algorithm-specific field so a reader interprets it correctly.
func writeMHL(out, algorithm string, hashes []fileHash) error {
	list := mhl.HashList{HashList: make([]mhl.Hash, 0, len(hashes))}
	now := mhl.MHLDate{Time: time.Now()}
	for _, fh := range hashes {
		entry := mhl.Hash{File: fh.path, HashDate: now}
		setHashField(&entry, algorithm, fh.hash)
		list.HashList = append(list.HashList, entry)
	}
	data, err := xml.MarshalIndent(list, "", "  ")
	if err != nil {
		// COVERAGE: justified-unreachable defensive branch. list is composed solely of
		// strings and time values with simple xml struct tags, which xml.MarshalIndent
		// never fails to encode. Kept as a defensive error rather than ignored; not
		// covered because no input produces an un-marshalable value.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return err
	}
	return os.WriteFile(out, data, mhlFilePerm)
}

// setHashField stores the hash in the mhl.Hash field matching the algorithm, defaulting
// to the XXH3 field for the default/unrecognized algorithm.
func setHashField(entry *mhl.Hash, algorithm, hash string) {
	switch algorithm {
	case "md5":
		entry.MD5 = hash
	case "xxhash":
		entry.XXHash = hash
	case "xxhash64":
		entry.XXHash64 = hash
	default:
		entry.XXH3 = hash
	}
}
