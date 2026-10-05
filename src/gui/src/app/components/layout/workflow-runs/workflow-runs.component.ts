import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import {
    WorkflowRunsTableComponent,
} from '@app/components/containers/tables/workflow-runs-table/workflow-runs-table.component';

/**
 * Modal host for the workflow runs management view (runner-GUI doc section 7). It is a
 * sibling of the workflow runner modal rather than a tab inside it: the runner is a
 * transient open-file -> fill-params -> submit flow, while runs management is a persistent
 * monitoring surface that outlives any single run, so folding it into the runner would
 * force the user to re-open a file just to check on runs. Both hang off the toolbar
 * settings dropdown, matching the established modal-host pattern (Settings, the runner).
 */
@Component({
    selector: 'fme-workflow-runs',
    templateUrl: './workflow-runs.component.html',
    styleUrls: ['./workflow-runs.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        WorkflowRunsTableComponent,
        MatDialogTitle,
        MatDialogContent,
        MatDialogClose,
        MatIcon,
        MatIconButton,
    ],
})
export class WorkflowRunsComponent {
}
