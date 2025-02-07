import { Component, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { marker as TEXT } from '@ngneat/transloco-keys-manager/marker';
import * as _ from 'lodash';
import { Observable, of, timer } from 'rxjs';
import { delayWhen, map, switchMap } from 'rxjs/operators';

import { format } from '~/app/functions.helper';
import { DeclarativeFormComponent } from '~/app/shared/components/declarative-form/declarative-form.component';
import { PageStatus } from '~/app/shared/components/page-status/page-status.component';
import { DeclarativeFormConfig } from '~/app/shared/models/declarative-form-config.type';
import { AdminOpsBucketService, Bucket } from '~/app/shared/services/api/admin-ops-bucket.service';
import { AdminOpsUserService } from '~/app/shared/services/api/admin-ops-user.service';

@Component({
  selector: 's3gw-bucket-form-page',
  templateUrl: './bucket-form-page.component.html',
  styleUrls: ['./bucket-form-page.component.scss']
})
export class BucketFormPageComponent implements OnInit {
  @ViewChild(DeclarativeFormComponent, { static: false })
  form!: DeclarativeFormComponent;

  public pageStatus: PageStatus = PageStatus.none;
  public savingErrorText: string = TEXT('Failed to save bucket.');
  public config: DeclarativeFormConfig = {
    fields: []
  };

  private listIds$: Observable<string[]>;
  private ownerOptions: Record<any, string> = {};

  constructor(
    private route: ActivatedRoute,
    private adminOpsBucketService: AdminOpsBucketService,
    private adminOpsUserService: AdminOpsUserService,
    private router: Router
  ) {
    this.createForm(this.router.url.startsWith(`/admin/buckets/edit`));
    (this.listIds$ = this.adminOpsUserService.listIds()).subscribe({
      next: (users: string[]) => {
        // Update the options of the 'owner' field.
        const field = _.find(this.config.fields, ['name', 'owner']);
        if (!_.isUndefined(field)) {
          field.options = _.reduce(
            users,
            (result, user: string) => {
              _.set(result, user, user);
              return result;
            },
            {}
          );
        }
      }
    });
  }

  ngOnInit(): void {
    this.route.params.subscribe((value: Params) => {
      if (!_.has(value, 'bid')) {
        this.pageStatus = PageStatus.ready;
        return;
      }
      const bid = decodeURIComponent(value['bid']);
      this.pageStatus = PageStatus.loading;
      this.adminOpsBucketService
        .get(bid)
        .pipe(
          // Wait until the list of owners has been loaded and the form
          // configuration has been updated.
          delayWhen(() => this.listIds$)
        )
        .subscribe({
          next: (bucket: Bucket) => {
            this.pageStatus = PageStatus.ready;
            this.form.patchValues(bucket);
          },
          error: () => {
            this.pageStatus = PageStatus.loadingError;
          }
        });
    });
  }

  private createForm(editing: boolean) {
    this.config = {
      buttons: [
        {
          type: 'default',
          text: TEXT('Cancel'),
          click: () => this.router.navigate(['/admin/buckets'])
        },
        {
          type: 'submit',
          text: editing ? TEXT('Update') : TEXT('Create'),
          click: () => {
            if (editing) {
              this.updateBucket();
            } else {
              this.createBucket();
            }
          }
        }
      ],
      fields: [
        {
          type: 'hidden',
          name: 'id',
          value: '',
          submitValue: editing
        },
        {
          type: 'text',
          name: 'bucket',
          label: TEXT('Name'),
          hint: TEXT('The name of the bucket.'),
          value: '',
          readonly: editing,
          autofocus: !editing,
          validators: {
            required: true,
            asyncCustom: this.bucketNameValidator()
          }
        },
        {
          type: 'select',
          name: 'owner',
          label: TEXT('Owner'),
          hint: TEXT('The owner of the bucket.'),
          value: '',
          autofocus: editing,
          options: this.ownerOptions,
          validators: {
            required: true
          }
        },
        {
          type: 'checkbox',
          name: 'versioning',
          label: TEXT('Versioning'),
          hint: TEXT('Enable versioning for the objects in this bucket.'),
          value: false
        }
      ]
    };
  }

  private createBucket(): void {
    const bucket: Bucket = this.form.values as Bucket;
    this.adminOpsBucketService.create(bucket).subscribe({
      next: () => {
        this.router.navigate(['/admin/buckets']);
      },
      error: (err) => {
        this.pageStatus = PageStatus.savingError;
        this.savingErrorText = format(TEXT('Failed to save bucket (code={{ err.code }}).'), {
          err
        });
      }
    });
  }

  private updateBucket(): void {
    const bucket: Partial<Bucket> = this.form.values;
    this.adminOpsBucketService.update(bucket).subscribe({
      next: () => {
        this.router.navigate(['/admin/buckets']);
      },
      error: (err) => {
        this.pageStatus = PageStatus.savingError;
        this.savingErrorText = format(TEXT('Failed to save bucket (code={{ err.code }}).'), {
          err
        });
      }
    });
  }

  private bucketNameValidator(): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      if (control.pristine || _.isEmpty(control.value)) {
        return of(null);
      }
      return timer(200).pipe(
        switchMap(() => this.adminOpsBucketService.exists(control.value)),
        map((resp: boolean) => {
          if (!resp) {
            return null;
          } else {
            return { custom: TEXT('The name already exists.') };
          }
        })
      );
    };
  }
}
