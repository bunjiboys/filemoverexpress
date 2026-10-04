package workflow

import (
	"context"
	"fmt"

	"github.com/awslabs/filemoverexpress/config"
	"github.com/awslabs/filemoverexpress/inventory"
	"github.com/awslabs/filemoverexpress/types/configtypes"
	"github.com/awslabs/filemoverexpress/types/inventorytypes"
)

// InventoryExecutor runs an InventoryReport step: it resolves the named transfer profile
// and calls the inventory generator (format doc "The InventoryReport step payload"). Both
// the profile resolver and the generator are injected seams (defaulting to the real
// config/inventory calls) so the mapping from `with` to GenerateInventoryInput is tested
// without a live AWS session; the single real generate call is the only part faked in
// tests.
type InventoryExecutor struct {
	resolveProfile func(name string) (configtypes.TransferProfile, error)
	generate       func(inventorytypes.GenerateInventoryInput) error
}

// NewInventoryExecutor builds an InventoryExecutor wired to the real profile resolver
// (config.LoadConfiguration().GetTransferProfile) and inventory.GenerateInventory.
func NewInventoryExecutor() *InventoryExecutor {
	return &InventoryExecutor{
		resolveProfile: func(name string) (configtypes.TransferProfile, error) {
			// COVERAGE: justified-unreachable in unit tests. This closure calls
			// config.LoadConfiguration(), which reads the daemon's on-disk config; a unit
			// test injects a fake resolveProfile instead. The mapping and error handling in
			// Execute ARE covered. See the implementation plan section 7.
			return config.LoadConfiguration().GetTransferProfile(name)
		},
		generate: inventory.GenerateInventory,
	}
}

// Execute maps the step's `with` to a GenerateInventoryInput and runs the generator. It
// fails if transferProfile is missing or unknown, or if the generator returns an error.
func (i *InventoryExecutor) Execute(_ context.Context, step Step) error {
	name := withString(step.With, "transferProfile")
	if name == "" {
		return fmt.Errorf("workflow: inventory step %s has no transferProfile", step.ID)
	}
	profile, err := i.resolveProfile(name)
	if err != nil {
		return fmt.Errorf("workflow: inventory step %s: %w", step.ID, err)
	}
	input := inventorytypes.GenerateInventoryInput{
		TransferProfile:  profile,
		OutputFormat:     withString(step.With, "outputFormat"),
		Pretty:           withBool(step.With, "pretty", false),
		IncludeChecksums: withBool(step.With, "includeChecksums", false),
	}
	if err := i.generate(input); err != nil {
		return fmt.Errorf("workflow: inventory step %s: %w", step.ID, err)
	}
	return nil
}
