/* global Flow, Option */
'use strict'

$(document).ajaxSend(function (e, request, settings) {
  // Append a CSRF token to all AJAX POST requests.
  if (settings.type === 'POST' && settings.data.length) {
    settings.data +=
             '&' + encodeURIComponent(Yoda.csrf.tokenName) +
              '=' + encodeURIComponent(Yoda.csrf.tokenValue)
  }
})

let preservableFormatsLists = null
let currentFolder
let filenames = []
let hasReadRights = true
let uploadFolder = false

$(function () {
  // Extract current location from query string (default to '').
  currentFolder = decodeURIComponent((/(?:\?|&)dir=([^&]*)/
    .exec(window.location.search) || [0, ''])[1])

  // Canonicalize path somewhat, for convenience.
  currentFolder = currentFolder.replace(/\/+/g, '/').replace(/\/$/, '')

  // Needed for the table to show the links depending on permissions
  topInformation(currentFolder, true)

  if ($('#file-browser').length) {
    startBrowsing()
  }

  window.onbeforeunload = function (e) {
    if (!$('#uploads').hasClass('hidden')) {
      if ($('.uploads-total-progress-bar-perc').html() !== '100%') {
        return e.returnValue
      }
    }
  }

  $('.btn-go-to-vault').on('click', function () {
    window.location.href = '/vault/?dir=' + encodeURIComponent('/' + $(this).attr('vault-area'))
  })

  $('.btn-go-to-group-manager').on('click', function () {
    Yoda.storage.session.set('selected-group', $(this).attr('group'))
    window.location.href = '/group_manager'
  })

  $('.btn-group button.metadata-form').on('click', function () {
    showMetadataForm($(this).attr('data-path'))
  })

  /// /////////////////////////////////////////////
  // File and folder management from context menu
  /// /////////////////////////////////////////////
  $('.btn-group button.folder-create').on('click', function () {
    // Destroy earlier alerts
    fileMgmtDialogAlert('folder-create', '')

    // Set initial values
    $('#path-folder-create').val('')
    $('#folder-create #collection').text($(this).attr('data-path')) // for user
    $('.btn-confirm-folder-create').attr('data-path', $(this).attr('data-path'))

    $('#folder-create').modal('show')
    // focus to be set after modal show
    $('#path-folder-create').focus()
  })

  // handle addition of new folder to
  $('.btn-confirm-folder-create').on('click', function () {
    // er kan een dubbele naam zijn? error handling afwikkelen!
    handleFolderAdd($('#path-folder-create').val(), $(this).attr('data-path'))
  })

  // Catch pressing the enter key and save the new folder
  $('#path-folder-create').on('keyup', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      handleFolderAdd($(this).val(), $('.btn-confirm-folder-create').attr('data-path'))
    }
  })

  // FOLDER rename
  $('body').on('click', 'a.folder-rename', function () {
    fileMgmtDialogAlert('folder-rename', '')

    // set initial values for further processing and user experience
    $('#folder-rename-name').val($(this).attr('data-name'))
    $('#org-folder-rename-name').val($(this).attr('data-name'))
    $('#folder-rename #collection').text($(this).attr('data-collection'))
    $('.btn-confirm-folder-rename').attr('data-collection', $(this).attr('data-collection'))

    $('#folder-rename').modal('show')
    document.getElementById('folder-rename-name').focus()
    document.getElementById('folder-rename-name').setSelectionRange(0, -1)
  })

  $('.btn-confirm-folder-rename').on('click', function () {
    handleFolderRename($('#folder-rename-name').val(), $(this).attr('data-collection'), $('#org-folder-rename-name').val())
  })

  // Catch pressing the enter key and rename the folder
  $('#folder-rename-name').on('keyup', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      handleFolderRename($(this).val(), $('.btn-confirm-folder-rename').attr('data-collection'), $('#org-folder-rename-name').val())
    }
  })

  // FOLDER delete
  $('body').on('click', 'a.folder-delete', function () {
    fileMgmtDialogAlert('folder-delete', '')

    // set initial values for further processing and user experience
    $('#folder-delete #collection').text($(this).attr('data-collection'))
    $('#folder-delete-name').text($(this).attr('data-name'))
    $('.btn-confirm-folder-delete').attr('data-collection', $(this).attr('data-collection'))
    $('.btn-confirm-folder-delete').attr('data-name', $(this).attr('data-name'))

    $('#folder-delete').modal('show')
  })

  $('.btn-confirm-folder-delete').on('click', function () {
    handleFolderDelete($(this).attr('data-collection'), $(this).attr('data-name'))
  })

  // Clean up temporary files.
  $('body').on('click', 'a.action-cleanup', function () {
    fileMgmtDialogAlert('cleanup-collection', '')

    const folder = $(this).attr('data-folder')
    $('#cleanup-collection #collection').text($(this).attr('data-folder'))
    $('.btn-confirm-cleanup-collection').attr('data-collection', $(this).attr('data-folder'))

    $('#cleanup-files').html('')
    Yoda.call('research_list_temporary_files',
      { coll: Yoda.basePath + folder }).then((data) => {
      const fullPath = Yoda.basePath + folder
      const length = fullPath.length + 1

      if (data.length === 0) {
        $('#cleanup-files').html('No files found requiring cleanup action.')
        return
      }

      $('#cleanup-files').html('<div class="col-md-12"><input type="checkbox" class="form-check-input ms-1 cleanup-check-all"> Select all files</div>')
      $.each(data, function (index, fileData) {
        const file = fileData[0] + '/' + fileData[1]
        const fileRelative = file.substring(length)
        addCleanupFile(fileData, fileRelative, index)
      })
      $('.cleanup-check-all').on('click', function () {
        // "cleanup-select-file"
        $('.cleanup-select-file').prop('checked', $(this).is(':checked'))
      })
      $('.cleanup-single-file').on('click', function () {
        const collName = $(this).attr('coll-name')
        const dataName = $(this).attr('data-name')
        const rowId = $(this).attr('row-id')
        if (window.confirm("Are you sure you want to delete '" + collName + '/' + dataName + "'?") === true) {
          handleCleanupFileDelete(collName, dataName)
          // Remove deleted file from active view
          $('#row-id-' + rowId).remove()
          if ($('#cleanup-files').html() === '') {
            $('#cleanup-files').html('No files found requiring cleanup action.')
          }
          // Synchronise browse view with deleted file
          browse(folder)
        }
      })
    })

    $('#cleanup-collection').modal('show')
  })

  // Show checksum report
  $('body').on('click', 'a.action-show-checksum-report', function () {
    const folder = $(this).attr('data-folder')
    const downloadUrl = 'browse/download_checksum_report?path=' + encodeURIComponent(folder)

    $('#showChecksumReport .collection').text(folder)
    $('#showChecksumReport .modal-body #checksumReport').html('')
    $('#showChecksumReport .modal-footer .download-report-text').attr('href', downloadUrl + '&format=text')
    $('#showChecksumReport .modal-footer .download-report-csv').attr('href', downloadUrl + '&format=csv')

    Yoda.call('research_manifest',
      { coll: Yoda.basePath + folder }).then((data) => {
      let table = '<table class="table table-striped"><tbody>'

      table += '<thead><tr><th>Filename</th><th>Size</th><th>Checksum</th></tr></thead>'
      $.each(data, function (index, obj) {
        table += `<tr>
                     <td>${obj.name}</td>
                     <td>${obj.size}</td>
                     <td>${obj.checksum}</td>
                </tr>`
      })
      table += '</tbody></table>'

      $('#showChecksumReport .modal-body #checksumReport').html(table)
      $('#showChecksumReport').modal('show')
    })
  })

  $('.btn-confirm-cleanup-collection').on('click', function () {
    $('.cleanup-select-file').each(function (index, item) {
      if ($(item).is(':checked')) {
        const collName = $(this).attr('coll-name')
        const dataName = $(this).attr('data-name')
        const rowId = $(item).attr('row-id')
        handleCleanupFileDelete(collName, dataName)
        $('#row-id-' + rowId).remove()
        if ($('#cleanup-files').html() === '') {
          $('#cleanup-files').html('No files found requiring cleanup action.')
        }
      }
    })
    browse($(this).attr('data-collection'))
    if ($('#cleanup-files').html() === 'No files found requiring cleanup action.') {
      Yoda.set_message('success', 'No files found requiring cleanup action')
    } else {
      Yoda.set_message('success', 'Successfully cleaned up folder ' + $(this).attr('data-collection'))
    }
    $('#cleanup-collection').modal('hide')
  })

  // FILE rename
  $('body').on('click', 'a.file-rename', function () {
    // Destroy earlier alerts
    fileMgmtDialogAlert('file-rename', '')

    // set initial values for further processing and user experience
    $('#file-rename-name').val($(this).attr('data-name'))
    $('#org-file-rename-name').val($(this).attr('data-name'))
    $('#file-rename #collection').text($(this).attr('data-collection'))
    $('.btn-confirm-file-rename').attr('data-collection', $(this).attr('data-collection'))

    $('#file-rename').modal('show')
    // input text selection handling - select all text in front of last '.'
    $('#file-rename-name').focus()
    let endSelection = $(this).attr('data-name').lastIndexOf('.')
    if (endSelection === -1) {
      endSelection = $(this).attr('data-name').length
    }
    document.getElementById('file-rename-name').setSelectionRange(0, endSelection)
  })

  $('.btn-confirm-file-rename').on('click', function () {
    handleFileRename($('#file-rename-name').val(), $(this).attr('data-collection'), $('#org-file-rename-name').val())
  })

  // FILE delete
  $('body').on('click', 'a.file-delete', function () {
    // Destroy earlier alerts
    fileMgmtDialogAlert('file-delete', '')

    // set initial values for further processing and user experience
    $('#file-delete #collection').text($(this).attr('data-collection'))
    $('#file-delete-name').text($(this).attr('data-name'))
    $('.btn-confirm-file-delete').attr('data-collection', $(this).attr('data-collection'))
    $('.btn-confirm-file-delete').attr('data-name', $(this).attr('data-name'))

    $('#file-delete').modal('show')
  })

  $('.btn-confirm-file-delete').on('click', function () {
    handleFileDelete($(this).attr('data-collection'), $(this).attr('data-name'))
  })

  $('.upload-folder').on('click', function () {
    uploadFolder = true
  })

  $('.upload-file').on('click', function (){
    uploadFolder = false
  })

  // Flow.js upload handler
  const r = new Flow({
    target: '/research/upload',
    chunkSize: 25 * 1024 * 1024,
    forceChunkSize: true,
    simultaneousUploads: 1,
    testChunks: false,         // Disabled because of need to be able to overwrite files with different content
    query: { csrf_token: Yoda.csrf.tokenValue, filepath: '' }
  })
  // Flow.js isn't supported, fall back on a different method
  if (!r.support) {
    Yoda.set_message('error', 'No upload browser support.')
  }

  // Assign upload places for dropping/selecting files
  r.assignDrop($('.upload-drop')[0])
  r.assignBrowse($('.upload-file')[0])
  r.assignBrowse($('.upload-folder')[0], true)

  // When chosing to close overview of upload overview then all incomplete file uploads will be canceled.
  $('.btn-close-uploads-overview').on('click', function () {
    r.cancel()
    $('#files').html('')
    $('#uploads').addClass('hidden')
    // clear information present for next time dialog is presented
    $('.uploads-progress-information').html('')
    $('.uploads-total-progress-bar').css('width', '0%')
    $('.uploads-total-progress-bar-perc').html('0%')
  })

  // Flow.js handle events
  r.on('filesAdded', function (files) {
    if (files.length) {
      $('#files').html('')
      // clear information present for new totals
      $('.uploads-progress-information').html('')
      $('.uploads-total-progress-bar').css('width', '0%')
      $('.uploads-total-progress-bar-perc').html('0%')

      const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name))

      $.each(sortedFiles, function (key, file) {
        const secureFile = secureFilename(file.name)
        const fileName = file.relativePath.substring(0, file.relativePath.lastIndexOf("/") + 1) + secureFile
        logUpload(file.uniqueIdentifier, fileName)
        const folderName = file.relativePath.substring(0, file.relativePath.indexOf("/"))
        let overwrite = false

        const $self = $('#' + file.uniqueIdentifier)
        // Pause btn
        $self.find('.upload-pause').on('click', function () {
          file.pause()
          $self.find('.upload-pause').hide()
          $self.find('.upload-resume').show()
          $self.find('.msg').text('Upload paused')
        })
        // Resume btn
        $self.find('.upload-resume').on('click', function () {
          file.resume()
          $self.find('.upload-pause').show()
          $self.find('.upload-resume').hide()
          $self.find('.msg').html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
        })
        // Cancel btn
        $self.find('.upload-cancel').on('click', function () {
          file.cancel()
          $self.remove()
        })
        // Retry btn
        $self.find('.upload-retry').on('click', function () {
          file.retry()
          $self.find('.upload-pause').show()
          $self.find('.upload-retry').hide()
          $self.find('.msg').html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
        })

        if (uploadFolder) {
          if (filenames.includes(folderName)) {
            overwrite = true
          }
        }
        else {
          if (filenames.includes(secureFile)) {
            overwrite = true
          }
        }
        if (overwrite) {
          file.pause()
          $self.find('.msg').text('Upload paused')
          $self.find('.overwrite-div').removeClass('hidden')
          $self.find('.upload-cancel').hide()
          $self.find('.upload-pause').hide()
          // Overwrite btn
          $self.find('.upload-overwrite').on('click', function () {
            file.resume()
            $self.find('.overwrite-div').addClass('hidden')
            $self.find('.upload-pause').show()
            $self.find('.upload-cancel').show()
            $self.find('.msg').html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
          })

          // No Overwrite btn
          $self.find('.upload-no-overwrite').on('click', function () {
            file.cancel()
            $self.find('.overwrite-div').addClass('hidden')
            $self.remove()
          })
        }
      })
    }
    $('#uploads').removeClass('hidden')
  })
  r.on('filesSubmitted', function () {
    const path = $('.upload').attr('data-path')
    r.opts.query.filepath = path
    r.upload()
  })
  r.on('complete', function () {
    const path = $('.upload').attr('data-path')
    browse(path)
  })
  r.on('fileSuccess', function (file, message) {
    $('#' + file.uniqueIdentifier + ' .msg').html("<span class='text-success'>Upload complete</span>")
    const $self = $('#' + file.uniqueIdentifier)
    $self.find('.upload-btns').hide()
    const path = $('.upload').attr('data-path')
    browse(path)
  })
  r.on('fileError', function (file, message) {
    $('#' + file.uniqueIdentifier + ' .msg').html('Upload failed')
    $('#' + file.uniqueIdentifier + ' .progress-bar').css('width', '0%')
    const $self = $('#' + file.uniqueIdentifier)
    $self.find('.upload-pause').hide()
  })
  r.on('fileProgress', function (file) {
    const percent = Math.floor(file.progress() * 100)
    $('#' + file.uniqueIdentifier + ' .progress-bar').css('width', percent + '%')
    updateProgress(r.files)
  })
  r.on('fileRemoved', function (file) {
    updateProgress(r.files)
  })

  $('body').on('dragbetterenter', function (event) {
    $('.upload-drop').addClass('drag-upload')
    Yoda.set_message('success', 'Drop the files to the file browser.')
  })

  $('body').on('dragbetterleave', function (event) {
    $('.upload-drop').removeClass('drag-upload')
    $('#messages').html('')
  })

  $('body').on('click', 'a.action-lock', function () {
    lockFolder($(this).attr('data-folder'))
  })

  $('body').on('click', 'a.action-unlock', function () {
    unlockFolder($(this).attr('data-folder'))
  })

  $('body').on('click', 'a.action-submit', function () {
    submitToVault($(this).attr('data-folder'))
  })

  $('body').on('click', 'a.action-check-for-unpreservable-files', function () {
    // Check for unpreservable file formats.
    // If present, show extensions to user.
    $('#file-formats-list').val('')

    $('#showUnpreservableFiles .help').hide()
    $('#showUnpreservableFiles .preservable').hide()
    $('#showUnpreservableFiles .advice').hide()
    $('#showUnpreservableFiles .unpreservable').hide()
    $('#showUnpreservableFiles .checking').hide()

    if (preservableFormatsLists === null) {
      // Retrieve preservable file format lists.
      Yoda.call('vault_preservable_formats_lists').then((data) => {
        preservableFormatsLists = data

        $('#file-formats-list').html("<option value='' disabled selected>Select a file format list</option>")
        for (const list in data) {
          if (Object.prototype.hasOwnProperty.call(data, list)) {
            $('#file-formats-list').append(new Option(data[list].name, list))
          }
        }
        $('#showUnpreservableFiles').modal('show')
      })
    } else {
      $('#showUnpreservableFiles').modal('show')
    }
  })

  $('#file-formats-list').on('change', function () {
    const folder = $('a.action-check-for-unpreservable-files').attr('data-folder')
    const list = $('#file-formats-list option:selected').val()
    if (!(list in preservableFormatsLists)) { return }

    $('#showUnpreservableFiles .checking').show()
    $('#showUnpreservableFiles .unpreservable').hide()
    $('#showUnpreservableFiles .preservable').hide()
    $('#showUnpreservableFiles .advice').hide()
    $('#showUnpreservableFiles .help').hide()

    $('#showUnpreservableFiles .help').text(preservableFormatsLists[list].help)
    $('#showUnpreservableFiles .advice').text(preservableFormatsLists[list].advice)

    // Retrieve unpreservable files in folder.
    Yoda.call('vault_unpreservable_files',
      { coll: Yoda.basePath + folder, list_name: list }).then((data) => {
      $('#showUnpreservableFiles .checking').hide()
      $('#showUnpreservableFiles .help').show()
      if (data.length > 0) {
        $('#showUnpreservableFiles .list-unpreservable-formats').html('')
        for (const ext of data) { $('#showUnpreservableFiles .list-unpreservable-formats').append(`<li>${Yoda.htmlEncode(ext)}</li>`) }
        $('#showUnpreservableFiles .advice').show()
        $('#showUnpreservableFiles .unpreservable').show()
      } else {
        $('#showUnpreservableFiles .preservable').show()
      }
      $('#showUnpreservableFiles').modal('show')
    })
  })

  $('body').on('click', 'a.action-unsubmit', function () {
    unsubmitToVault($(this).attr('data-folder'))
  })

  $('body').on('click', 'a.action-accept', function () {
    acceptFolder($(this).attr('data-folder'))
  })

  $('body').on('click', 'a.action-reject', function () {
    rejectFolder($(this).attr('data-folder'))
  })

  $('body').on('click', 'i.lock-icon', function () {
    toggleLocksList($(this).attr('data-folder'))
  })

  $('body').on('click', 'i.actionlog-icon', function () {
    toggleActionLogList($(this).attr('data-folder'))
  })

  $('body').on('click', 'i.system-metadata-icon', function () {
    toggleSystemMetadata($(this).attr('data-folder'))
  })

  $('body').on('click', '.browse', function (e) {
    browse($(this).attr('data-path'), true)
    // Dismiss stale messages.
    $('#messages .close').trigger('click')
    e.preventDefault()
  })

  $('body').on('click', "input:checkbox[name='multiSelect[]']", function () {
    if ($("input:checkbox[name='multiSelect[]']:checked").length) {
      $('#multiSelect').removeClass('hide')
    } else {
      $('#multiSelect').addClass('hide')
    }
  })

  $('body').on('click', "input:checkbox[id='multi-select-all']", function () {
    if ($(this).is(':checked')) {
      if ($("input:checkbox[name='multiSelect[]']").length) {
        $("input:checkbox[name='multiSelect[]']").prop('checked', true)
        $('#multiSelect').removeClass('hide')
      }
    } else {
      $("input:checkbox[name='multiSelect[]']").prop('checked', false)
      $('#multiSelect').addClass('hide')
    }
  })

  dragElement(document.getElementById('uploads'))
})

function secureFilename (file) {
  // mirrors behaviour of unicode_secure_filename in util.py
  let result = ''
  result = file.replace(/[\u{0000}-\u{001F}\u{007F}\\\/]/gu, '')

  if (result === '..') {
    return ''
  }

  return result
}

// Update upload progress bar
function updateProgress (files) {
  // presentation of totalised datasize percentages
  let totalSize = 0
  let totalSizeUploaded = 0
  // presentation of totalised file counts
  let countTotal = 0
  let countTotalCompleted = 0
  $.each(files, function (key, flowFile) {
    // id has to be present in frontend as r.files contains all files (including the ones already uploaded)
    if ($('#' + flowFile.uniqueIdentifier).length) {
      // size totals
      totalSize += flowFile.size
      totalSizeUploaded += flowFile.size * flowFile.progress()
      // count totals
      countTotal++
      if (flowFile.progress() === 1) {
        countTotalCompleted++
      }
    }
  })

  let percentage = 0
  if (totalSize > 0) {
    percentage = Math.floor((totalSizeUploaded / totalSize) * 100)
  }
  $('.uploads-progress-information').html('&nbsp;-&nbsp;completed ' + countTotalCompleted.toString() + ' of ' + countTotal.toString())
  $('.uploads-total-progress-bar').css('width', percentage + '%')
  $('.uploads-total-progress-bar-perc').html(percentage + '%')
}

// draggability of the upload overview div
function dragElement (elmnt) {
  let pos1 = 0; let pos2 = 0; let pos3 = 0; let pos4 = 0
  if (document.getElementById('uploads_header')) {
    document.getElementById('uploads_header').onmousedown = dragMouseDown
  } else {
    elmnt.onmousedown = dragMouseDown
  }

  function dragMouseDown (e) {
    e = e || window.event
    e.preventDefault()
    pos3 = e.clientX
    pos4 = e.clientY
    document.onmouseup = closeDragElement
    document.onmousemove = elementDrag
  }

  function elementDrag (e) {
    e = e || window.event
    e.preventDefault()
    pos1 = pos3 - e.clientX
    pos2 = pos4 - e.clientY
    pos3 = e.clientX
    pos4 = e.clientY
    elmnt.style.top = (elmnt.offsetTop - pos2) + 'px'
    elmnt.style.left = (elmnt.offsetLeft - pos1) + 'px'
  }

  function closeDragElement () {
    document.onmouseup = null
    document.onmousemove = null
  }
}

async function handleFolderAdd (newFolder, collection) {
  if (!newFolder.length) {
    fileMgmtDialogAlert('folder-create', 'Please add a folder name')
    return
  }
  $('#folder-create .btn-confirm-folder-create').html('Creating <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  const result = await Yoda.call('research_folder_add',
    {
      coll: Yoda.basePath + collection,
      new_folder_name: newFolder
    },
    { quiet: true, rawResult: true }
  )

  if (result.status === 'ok') {
    Yoda.set_message('success', 'Successfully added new folder: ' + newFolder + ' to ' + collection)
    browse(collection, true)
    $('#folder-create').modal('hide')
  } else {
    fileMgmtDialogAlert('folder-create', result.status_info)
  }
  $('#folder-create .btn-confirm-folder-create').html('Create new folder')
}

async function handleFolderRename (newFolderName, collection, orgFolderName) {
  if (!newFolderName.length) {
    fileMgmtDialogAlert('folder-rename', 'Please add a new folder name')
    return
  }
  $('#folder-rename .btn-confirm-folder-rename').html('Renaming <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  const result = await Yoda.call('research_folder_rename',
    {
      new_folder_name: newFolderName,
      coll: Yoda.basePath + collection,
      org_folder_name: orgFolderName
    },
    { quiet: true, rawResult: true }
  )

  if (result.status === 'ok') {
    Yoda.set_message('success', 'Successfully renamed folder to ' + newFolderName)
    browse(collection, true)
    $('#folder-rename').modal('hide')
  } else {
    fileMgmtDialogAlert('folder-rename', result.status_info)
  }
  $('#folder-rename .btn-confirm-folder-rename').html('Rename Folder')
}

async function handleFolderDelete (collection, folderName) {
  $('#folder-delete .btn-confirm-folder-delete').html('Deleting <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  const result = await Yoda.call('research_folder_delete',
    {
      coll: Yoda.basePath + collection,
      folder_name: folderName
    },
    { quiet: true, rawResult: true }
  )

  if (result.status === 'ok') {
    Yoda.set_message('success', 'Successfully deleted folder ' + folderName)
    browse(collection, true)
    $('#folder-delete').modal('hide')
  } else {
    fileMgmtDialogAlert('folder-delete', result.status_info)
  }
  $('#folder-delete .btn-confirm-folder-delete').html('Delete Folder')
}

function addCleanupFile (file, fileRelative, index) {
  const cfile = `<div class="col-md-12" id="${'row-id-' + index}">
                     <input type="checkbox" class="form-check-input ms-1 cleanup-select-file" data-name="${file[1]}" coll-name="${file[0]}" row-id="${index}">
                     <i class="fa-solid fa-trash-can cleanup-single-file" data-name="${file[1]}" coll-name="${file[0]}" row-id="${index}"></i> ${Yoda.htmlEncode(fileRelative)}
                 </div>`
  $('#cleanup-files').append(cfile)
}

async function handleCleanupFileDelete (collection, fileName) {
  const result = await Yoda.call('research_file_delete',
    {
      coll: collection,
      file_name: fileName
    },
    { quiet: true, rawResult: true }
  )

  if (result.status === 'ok') {
    fileMgmtDialogAlert('cleanup-collection', 'Successfully deleted ' + fileName)
  } else {
    fileMgmtDialogAlert('cleanup-collection', result.status_info)
  }
}

async function handleFileRename (newFileName, collection, origFileName) {
  if (!newFileName.length) {
    fileMgmtDialogAlert('file-rename', 'Please add a new file name')
    return
  }
  $('#file-rename .btn-confirm-file-rename').html('Renaming <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  const result = await Yoda.call('research_file_rename',
    {
      new_file_name: newFileName,
      coll: Yoda.basePath + collection,
      org_file_name: origFileName
    },
    { quiet: true, rawResult: true }
  )

  if (result.status === 'ok') {
    Yoda.set_message('success', 'Successfully renamed file to ' + newFileName)
    browse(collection, true)
    $('#file-rename').modal('hide')
  } else {
    fileMgmtDialogAlert('file-rename', result.status_info)
  }
  $('#file-rename .btn-confirm-file-rename').html('Rename file')
}

async function handleFileDelete (collection, fileName) {
  $('#file-delete .btn-confirm-file-delete').html('Deleting <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  const result = await Yoda.call('research_file_delete',
    {
      coll: Yoda.basePath + collection,
      file_name: fileName
    },
    { quiet: true, rawResult: true }
  )

  if (result.status === 'ok') {
    Yoda.set_message('success', 'Successfully deleted file ' + fileName)
    browse(collection, true)
    $('#file-delete').modal('hide')
  } else {
    fileMgmtDialogAlert('file-delete', result.status_info)
  }
  $('#file-delete .btn-confirm-file-delete').html('Delete file')
}

// Alerts regarding folder/file management
function fileMgmtDialogAlert (dlgName, alert) {
  if (alert.length) {
    $('#alert-panel-' + dlgName + ' span').text(alert)
    $('#alert-panel-' + dlgName).show()
  } else {
    $('#alert-panel-' + dlgName).hide()
  }
}

function changeBrowserUrl (path) {
  let url = window.location.pathname
  if (typeof path !== 'undefined') {
    url += '?dir=' + encodeURIComponent(path)
  }

  window.history.pushState({}, {}, url)
}

function browse (dir = '', changeHistory = false) {
  currentFolder = dir
  // remove hide class that could have been added when a erroneous vault path was used.
  $('#file-browser_wrapper').removeClass('hide')
  handleGoToVaultButton(dir)
  handleGoToGroupManager(dir)
  makeBreadcrumb(dir)
  if (changeHistory) { changeBrowserUrl(dir) }
  topInformation(dir, true) // only here topInformation should show its alertMessage
  buildFileBrowser(dir)
}

function handleGoToVaultButton (dir) {
  // Handle the button with which to return to the corresponding research area.
  const parts = dir.split('/')

  if (parts.length > 1) {
    $('.btn-go-to-vault').attr('vault-area', parts[1].replace('research-', 'vault-')).show()
  } else {
    $('.btn-go-to-vault').attr('vault-area', '').hide()
  }
}

function handleGoToGroupManager (dir) {
  // Handle the button with which to return to the corresponding research area.
  const parts = dir.split('/')

  if (parts.length > 1) {
    $('.btn-go-to-group-manager').attr('group', parts[1]).show()
  } else {
    $('.btn-go-to-group-manager').attr('group', '').hide()
  }
}

function determineFileIcon (name, rowType, fileType) {
  // Determine icon
  if (rowType === 'coll') {
    return 'fa-folder'
  } else if (Yoda.isTextExtension(name)) {
    return 'fa-file-lines'
  } else if (fileType) {
    switch (fileType) {
      case 'audio':
        return 'fa-file-audio'
      case 'video':
        return 'fa-file-video'
      case 'image':
        return 'fa-file-image'
    }
  } else {
    return 'fa-file'
  }
}

function determineNameHTML (name, row, tgt, fileType, icon) {
  if (row.type === 'coll') {
    return `<a class="coll browse" href="?dir=${encodeURIComponent(tgt)}" data-path="${Yoda.htmlEncode(tgt)}"><i class="fa-regular ${icon}"></i> ${Yoda.htmlEncode(name)}</a>`
  } else if (hasReadRights && Yoda.isTextExtension(name) && row.size < 4 * 1024 * 1024) {
    return `<a href="/fileviewer?file=${encodeURIComponent(tgt)}" target="_blank" data-path="${Yoda.htmlEncode(tgt)}"><i class="fa-regular ${icon}"></i> ${Yoda.htmlEncode(name)}</a>`
  } else if (hasReadRights && fileType) {
    return `<a href="/fileviewer?file=${encodeURIComponent(tgt)}" target="_blank" data-path="${Yoda.htmlEncode(tgt)}"><i class="fa-regular ${icon}"></i> ${Yoda.htmlEncode(name)}</a>`
  } else {
    return `<i class="fa-regular ${icon}"></i> ${Yoda.htmlEncode(name)}`
  }
}

function makeBreadcrumb (dir) {
  const pathParts = dir.split('/').filter(x => x.length)

  // [[Crumb text, Path]] - e.g. [...['x', '/research-a/x']]
  const crumbs = [['Research', ''],
    ...Array.from(pathParts.entries())
      .map(([i, x]) => [x, '/' + pathParts.slice(0, i + 1).join('/')])]

  let html = ''
  for (let [i, [text, path]] of crumbs.entries()) {
    const el = $('<li class="breadcrumb-item">')
    text = Yoda.htmlEncode(text).replace(/ /g, '&nbsp;')
    if (i === crumbs.length - 1) { el.addClass('active').html(text) } else {
      el.html(`<a class="browse" data-path="${Yoda.htmlEncode(path)}"
                         href="?dir=${encodeURIComponent(path)}">${text}</a>`)
    }

    html += el[0].outerHTML
  }

  $('nav ol.breadcrumb').html(html)
}

function buildFileBrowser (dir) {
  const fileBrowser = $('#file-browser').DataTable()
  getFolderContents.dropCache()
  fileBrowser.ajax.reload()

  return true
}

// Fetches directory contents to populate the listing table.
const getFolderContents = (() => {
  // Close over some state variables.
  // -> we keep a multi-page cache handy, since getting only $page_length [=10]
  //    results each time is wasteful and slow.
  // A change in sort column/order or folder will invalidate the cache.

  // The amount of rows to request at once.
  // *Must* be equal to or greater than the largest datatables page length,
  // and *should* be smaller than iRODS SQL rows per batch.
  const batchSize = 200
  // (~140 B per entry in JSON returned by iRODS,
  //  so depending on name = up to 28K to transfer for each fetch)

  let total = false // Total subcollections / data objects.
  let cache = [] // Cached result rows (may be more than shown on one page).
  let cacheStart = null // Row number of the first cache entry.
  let cacheFolder = null // Folder path of the cache.
  let cacheSortCol = null // Cached sort column nr.
  let cacheSortOrder = null // Cached sort order.
  let i = 0 // Keep simultaneous requests from interfering.

  const get = async (args) => {
    // Check if we can use the cache.
    if (cache.length &&
         currentFolder === cacheFolder &&
         args.order[0].dir === cacheSortOrder &&
         args.order[0].column === cacheSortCol &&
         args.start >= cacheStart &&
         args.start + args.length <= cacheStart + batchSize) {
      return cache.slice(args.start - cacheStart, args.start - cacheStart + args.length)
    } else {
      // Nope, load new data via the API.
      const j = ++i
      const result = await Yoda.call('browse_folder',
        {
          coll: Yoda.basePath + currentFolder,
          offset: args.start,
          limit: batchSize,
          sort_order: args.order[0].dir,
          sort_on: ['name', 'size', 'modified'][args.order[0].column - 1],
          space: 'Space.RESEARCH'
        },
        { quiet: true, rawResult: false })

      // If another requests has come while we were waiting, simply drop this one.
      if (i !== j) return null

      // Populate the 'size' of collections so datatables doesn't get confused.
      filenames = []
      for (const x of result.items) {
        filenames.push(x.name)
        if (x.type === 'coll') { x.size = 0 }
      }
      // Update cache info.
      total = result.total
      cacheStart = args.start
      cache = result.items
      cacheFolder = currentFolder
      cacheSortCol = args.order[0].column
      cacheSortOrder = args.order[0].dir

      return cache.slice(args.start - cacheStart, args.length)
    }
  }

  // The actual function passed to datatables.
  // (needs a non-async wrapper cause datatables won't accept it otherwise)
  const fn = (args, cb, settings) => (async () => {
    const data = await get(args)
    if (data === null) { return }

    const callback = {
      data,
      recordsTotal: total,
      recordsFiltered: total
    }
    cb(callback)
  })()

  // Allow manually clearing results (needed during soft-reload after uploading a file).
  fn.dropCache = () => { cache = [] }
  return fn
})()

// Functions for rendering table cells, per column.
const tableRenderer = {
  multiselect: (name, _, row) => {
    const tgt = `${currentFolder}/${name}`
    let checkbox = ''
    if (currentFolder) {
      checkbox = `<input class="form-check-input ms-1" type="checkbox" name="multiSelect[]" value="${Yoda.htmlEncode(tgt)}" data-name="${Yoda.htmlEncode(name)}" data-type="${row.type}">`
    }
    return checkbox
  },
  name: (name, _, row) => {
    const tgt = `${currentFolder}/${name}`
    const fileType = Yoda.viewableExtensionType(name)
    const icon = determineFileIcon(name, row.type, fileType)

    return determineNameHTML(name, row, tgt, fileType, icon)
  },
  size: (size, _, row) => {
    if (row.type === 'coll') {
      return ''
    } else {
      const szs = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
      let szi = 0
      while (size >= 1024 && szi < szs.length - 1) {
        size /= 1024
        szi++
      }
      return (Math.floor(size * 10) / 10 + '') + '&nbsp;' + szs[szi]
    }
  },
  date: ts => {
    const date = new Date(ts * 1000)
    const pad = n => n < 10 ? '0' + n : '' + n
    const elem = $('<span>')
    elem.text(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
                 ` ${pad(date.getHours())}:${pad(date.getMinutes())}`)
    elem.attr('title', date.toString()) // (should include seconds and TZ info)
    return elem[0].outerHTML
  },
  context: (_, __, row) => {
    const actions = $('<div class="dropdown-menu">')

    if (row.type === 'coll') {
      // no context menu for toplevel group-collections - these cannot be altered or deleted
      if (currentFolder.length === 0) {
        return ''
      }
      actions.append(`<a href="#" class="dropdown-item folder-rename" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Rename this folder" >Rename</a>`)
      actions.append(`<a href="#" class="dropdown-item folder-copy" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Copy this folder">Copy</a>`)
      actions.append(`<a href="#" class="dropdown-item folder-move" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Move this folder">Move</a>`)
      actions.append(`<a href="#" class="dropdown-item folder-delete" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Delete this file">Delete</a>`)
    } else {
      actions.append(`<a class="dropdown-item file-download" href="browse/download?filepath=${encodeURIComponent(currentFolder + '/' + row.name)}" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Download this file">Download</a>`)
      actions.append(`<a href="#" class="dropdown-item file-rename" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Rename this file">Rename</a>`)
      actions.append(`<a href="#" class="dropdown-item file-copy" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Copy this file">Copy</a>`)
      actions.append(`<a href="#" class="dropdown-item file-move" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Move this file">Move</a>`)
      actions.append(`<a href="#" class="dropdown-item file-delete" data-collection="${Yoda.htmlEncode(currentFolder)}" data-name="${Yoda.htmlEncode(row.name)}" title="Delete this file">Delete</a>`)
    }

    const dropdown = $(`<div class="dropdown">
                            <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-name="${Yoda.htmlEncode(row.name)}" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                              <i class="fa-solid fa-ellipsis-h" aria-hidden="true"></i>
                            </button>`)
    dropdown.append(actions)

    return dropdown[0].outerHTML
  }
}

function startBrowsing () {
  $('#file-browser').DataTable({
    bFilter: false,
    bInfo: false,
    bLengthChange: true,
    language: {
      emptyTable: 'No accessible files/folders present',
      lengthMenu: '_MENU_'
    },
    dom: '<"top">frt<"bottom"lp><"clear">',
    columns: [{ render: tableRenderer.multiselect, orderable: false, data: 'name' },
      { render: tableRenderer.name, data: 'name' },
      // Size and date should be orderable, but limitations
      // on how queries work prevent us from doing this
      // correctly without significant overhead.
      // (enabling this as is may result in duplicated results for data objects)
      { render: tableRenderer.size, data: 'size' },
      { render: tableRenderer.date, orderable: false, data: 'modify_time' },
      { render: tableRenderer.context, orderable: false }],
    ajax: getFolderContents,
    processing: true,
    serverSide: true,
    iDeferLoading: 0,
    order: [[1, 'asc']],
    pageLength: parseInt(Yoda.storage.session.get('pageLength') === null ? Yoda.settings.number_of_items : Yoda.storage.session.get('pageLength'))
  })
  $('#file-browser').on('length.dt', function (e, settings, len) {
    Yoda.storage.session.set('pageLength', len)
  })
  browse(currentFolder)
}

function toggleLocksList (folder) {
  const isVisible = $('.lock').is(':visible')

  // toggle locks list
  if (isVisible) {
    $('.lock').hide()
  } else {
    // Get locks
    Yoda.call('folder_get_locks', { coll: Yoda.basePath + folder }).then((data) => {
      $('.lock').hide()

      let html = ''
      $.each(data, function (index, value) {
        html += '<a class="list-group-item list-group-item-action"><span class="browse" data-path="' + Yoda.htmlEncode(value) + '">' + Yoda.htmlEncode(value) + '</span></a>'
      })
      $('.lock-items').html(html)
      $('.lock').show()
    })
  }
}

function toggleActionLogList (folder) {
  const actionList = $('.actionlog')
  const actionListItems = $('.actionlog-items')

  const isVisible = actionList.is(':visible')

  // toggle locks list
  if (isVisible) {
    actionList.hide()
  } else {
    // Get provenance information
    Yoda.call('provenance_log', { coll: Yoda.basePath + folder }).then((data) => {
      actionList.hide()
      let html = ''
      if (data.length) {
        $.each(data, function (index, value) {
          html += '<a class="list-group-item list-group-item-action">' +
                         Yoda.htmlEncode(value[2]) +
                         ' - <strong>' +
                         Yoda.htmlEncode(value[1]) +
                         '</strong> - ' +
                         Yoda.htmlEncode(value[0]) +
                         '</a>'
        })
      } else {
        html += '<a class="list-group-item list-group-item-action">No provenance information present</a>'
      }
      actionListItems.html(html)
      actionList.show()
    })
  }
}

function toggleSystemMetadata (folder) {
  const systemMetadata = $('.system-metadata')
  const systemMetadataItems = $('.system-metadata-items')

  const isVisible = systemMetadata.is(':visible')

  // Toggle system metadata.
  if (isVisible) {
    systemMetadata.hide()
  } else {
    // Retrieve system metadata of folder.
    Yoda.call('research_system_metadata', { coll: Yoda.basePath + folder }).then((data) => {
      systemMetadata.hide()
      let html = ''
      if (data) {
        $.each(data, function (index, value) {
          html += '<a class="list-group-item list-group-item-action"><strong>' +
                        Yoda.htmlEncode(index) +
                        '</strong>: ' +
                        Yoda.htmlEncode(value) +
                        '</a>'
        })
      } else {
        html += '<a class="list-group-item list-group-item-action">No system metadata present</a>'
      }
      systemMetadataItems.html(html)
      systemMetadata.show()
    })
  }
}

window.addEventListener('popstate', function (e) {
  // Catch forward/backward navigation and reload the view.
  const query = window.location.search.substr(1).split('&').reduce(
    function (acc, kv) {
      const xy = kv.split('=', 2)
      acc[xy[0]] = xy.length === 1 || decodeURIComponent(xy[1])
      return acc
    }, {})

  browse('dir' in query ? query.dir : '')
})

function topInformation (dir, showAlert) {
  if (typeof dir !== 'undefined') {
    Yoda.call('research_collection_details',
      { path: Yoda.basePath + dir },
      { quiet: true, rawResult: true }).then((dataRaw) => {
      if (dataRaw.status === 'error_nonexistent') {
        Yoda.set_message('error', 'This research space path does not exist: ' + dir)
        $('#file-browser_wrapper').addClass('hide')
        $('.top-information').addClass('hide')

        // no more action required here
        return true
      }

      const data = dataRaw.data
      let statusText = ''
      const basename = data.basename
      const status = data.status
      const userType = data.member_type
      let hasWriteRights = true
      const isDatamanager = data.is_datamanager
      const lockCount = data.lock_count
      const isLocked = data.is_locked
      let actions = []

      $('.btn-group button.metadata-form').hide()

      $('.btn-group button.upload').attr('data-path', '')
      $('.btn-group button.upload').prop('disabled', true)
      $('.btn-group button.folder-create').attr('data-path', '')
      $('.btn-group button.folder-create').prop('disabled', true)

      $('a.folder-delete').addClass('disabled')
      $('a.folder-rename').addClass('disabled')
      $('a.folder-copy').addClass('disabled')
      $('a.folder-move').addClass('disabled')

      $('a.file-delete').addClass('disabled')
      $('a.file-rename').addClass('disabled')
      $('a.file-copy').addClass('disabled')
      $('a.file-move').addClass('disabled')

      $('.top-information').hide()
      $('.top-info-buttons').hide()

      // Set folder status badge and actions.
      if (typeof status !== 'undefined') {
        if (status === '') {
          statusText = ''
          actions.lock = 'Lock'
          actions.submit = 'Submit'
          actions.cleanup = 'Clean up temporary files'
        } else if (status === 'LOCKED') {
          statusText = 'Locked'
          actions.unlock = 'Unlock'
          actions.submit = 'Submit'
        } else if (status === 'SUBMITTED') {
          statusText = 'Submitted'
          actions.unsubmit = 'Unsubmit'
        } else if (status === 'ACCEPTED') {
          statusText = 'Accepted'
        } else if (status === 'SECURED') {
          statusText = 'Secured'
          actions.lock = 'Lock'
          actions.submit = 'Submit'
          actions.cleanup = 'Clean up temporary files'
        } else if (status === 'REJECTED') {
          statusText = 'Rejected'
          actions.lock = 'Lock'
          actions.submit = 'Submit'
          actions.cleanup = 'Clean up temporary files'
        }

        // Show metadata button.
        $('.btn-group button.metadata-form').attr('data-path', dir)
        $('.btn-group button.metadata-form').show()

        $('.btn-group button.folder-status').attr('data-datamanager', isDatamanager)
      }

      if (userType === 'none') {
        hasReadRights = false
      } else {
        hasReadRights = true
      }

      if (isLocked) {
        hasWriteRights = false
      }

      if (userType === 'reader' || userType === 'none') {
        actions = []
        hasWriteRights = false
      }

      if (isDatamanager) {
        // Check rights as datamanager.
        if (userType !== 'manager' && userType !== 'normal') {
          actions = []
          hasWriteRights = false
        }

        if (typeof status !== 'undefined') {
          if (status === 'SUBMITTED') {
            actions.accept = 'Accept'
            actions.reject = 'Reject'
          }
        }
      }

      // Check if folder is writable.
      if (hasWriteRights && (status === '' || status === 'REJECTED' || status === 'SECURED')) {
        // Enable uploads.
        $('.btn-group button.upload').attr('data-path', dir)
        $('.btn-group button.upload').prop('disabled', false)

        // Enable folder / file manipulations.
        $('.btn-group button.folder-create').attr('data-path', dir)
        $('.btn-group button.folder-create').prop('disabled', false)

        $('a.folder-rename').removeClass('disabled')
        $('a.folder-copy').removeClass('disabled')
        $('a.folder-move').removeClass('disabled')
        $('a.folder-delete').removeClass('disabled')
        $('a.file-rename').removeClass('disabled')
        $('a.file-copy').removeClass('disabled')
        $('a.file-move').removeClass('disabled')
        $('a.file-delete').removeClass('disabled')
      }

      // Lock icon
      $('.lock').hide()
      let lockIcon = ''
      if (lockCount !== 0 && typeof lockCount !== 'undefined') {
        lockIcon = `<i class="fa-solid fa-lock lock-icon" data-folder="${Yoda.htmlEncode(dir)}" data-locks="${lockCount}" title="${lockCount} lock(s) found" aria-hidden="true"></i>`
      }

      // Provenance action log
      $('.actionlog').hide()
      const actionLogIcon = ` <i class="fa-solid fa-book actionlog-icon" data-folder="${Yoda.htmlEncode(dir)}" aria-hidden="true" title="Show provenance information"></i>`

      // System metadata.
      $('.system-metadata').hide()
      const systemMetadataIcon = ` <i class="fa-solid fa-info-circle system-metadata-icon" data-folder="${Yoda.htmlEncode(dir)}" aria-hidden="true" title="Show system metadata"></i>`

      $('.btn-group button.folder-status').attr('data-write', hasWriteRights)

      // Add unpreservable files check to actions.
      actions['check-for-unpreservable-files'] = 'Check for compliance with policy'

      // Add checksum report
      actions['show-checksum-report'] = 'Show checksum report'

      // Handle actions
      handleActionsList(actions, dir)

      const folderName = Yoda.htmlEncode(basename).replace(/ /g, '&nbsp;')
      const statusBadge = '<span id="statusBadge" class="ms-2 badge rounded-pill bg-primary">' + statusText + '</span>'

      // Reset action dropdown.
      $('.btn-group button.folder-status').prop('disabled', false).next().prop('disabled', false)

      const icon = '<i class="fa-regular fa-folder-open" aria-hidden="true"></i>'
      $('.top-information h2').html(`<span class="icon">${icon}</span> ${folderName}${lockIcon}${systemMetadataIcon}${actionLogIcon}${statusBadge}`)

      // Show top information and buttons.
      if (typeof status !== 'undefined') {
        $('.top-information').show()
        $('.top-info-buttons').show()
      }
    })
  } else {
    $('.btn-group button.upload').attr('data-path', '')

    // Folder/ file manipulation data
    $('.btn-group button.folder-create').attr('data-path', '')

    $('.top-information').hide()
  }
}

function handleActionsList (actions, folder) {
  let html = ''
  let vaultHtml = ''
  const possibleActions = ['lock', 'unlock',
    'submit', 'unsubmit',
    'accept', 'reject']

  const possibleVaultActions = ['cleanup',
    'check-for-unpreservable-files',
    'show-checksum-report']

  $.each(possibleActions, function (index, value) {
    if (Object.prototype.hasOwnProperty.call(actions, value)) {
      html += '<a class="dropdown-item action-' + value + '" data-folder="' + Yoda.htmlEncode(folder) + '">' + actions[value] + '</a>'
    }
  })

  $.each(possibleVaultActions, function (index, value) {
    if (Object.prototype.hasOwnProperty.call(actions, value)) {
      vaultHtml += '<a class="dropdown-item action-' + value + '" data-folder="' + Yoda.htmlEncode(folder) + '">' + actions[value] + '</a>'
    }
  })

  if (html !== '' && vaultHtml !== '') {
    html += '<div class="dropdown-divider"></div>' + vaultHtml
  } else if (vaultHtml !== '') {
    html += vaultHtml
  }

  $('.action-list').html(html)
}

async function lockFolder (folder) {
  // Get current button text
  const btnText = $('#statusBadge').html()
  $('#statusBadge').html('Lock <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  $('.btn-group button.folder-status').prop('disabled', true).next().prop('disabled', true)

  // Change folder status call
  try {
    await Yoda.call('folder_lock', { coll: Yoda.basePath + folder })
    $('#statusBadge').text('Locked')
  } catch (e) {
    $('#statusBadge').html(btnText)
  }
  topInformation(folder, false)
}

async function unlockFolder (folder) {
  // Get current button text
  const btnText = $('#statusBadge').html()
  $('#statusBadge').html('Unlock <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  $('.btn-group button.folder-status').prop('disabled', true).next().prop('disabled', true)

  try {
    await Yoda.call('folder_unlock', { coll: Yoda.basePath + folder })
    $('#statusBadge').text('')
  } catch (e) {
    $('#statusBadge').html(btnText)
  }
  topInformation(folder, false)
}

function showMetadataForm (path) {
  window.location.href = 'metadata/form?path=' + encodeURIComponent(path)
}

async function submitToVault (folder) {
  if (typeof folder !== 'undefined') {
    // Set spinner & disable button
    const btnText = $('#statusBadge').html()
    $('#statusBadge').html('Submit <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
    $('.btn-group button.folder-status').prop('disabled', true).next().prop('disabled', true)

    try {
      const status = await Yoda.call('folder_submit', { coll: Yoda.basePath + folder })
      if (status === 'SUBMITTED') {
        $('#statusBadge').html('Submitted')
      } else if (status === 'ACCEPTED') {
        $('#statusBadge').html('Accepted')
      } else {
        $('#statusBadge').html(btnText)
      }
    } catch (e) {
      $('#statusBadge').html(btnText)
    }
    topInformation(folder, false)
  }
}

async function unsubmitToVault (folder) {
  if (typeof folder !== 'undefined') {
    const btnText = $('#statusBadge').html()
    $('#statusBadge').html('Unsubmit <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
    $('.btn-group button.folder-status').prop('disabled', true).next().prop('disabled', true)

    try {
      await Yoda.call('folder_unsubmit', { coll: Yoda.basePath + folder })
      $('#statusBadge').html('')
    } catch (e) {
      $('#statusBadge').html(btnText)
    }
    topInformation(folder, false)
  }
}

async function acceptFolder (folder) {
  const btnText = $('#statusBadge').html()
  $('#statusBadge').html('Accept <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  $('.btn-group button.folder-status').prop('disabled', true).next().prop('disabled', true)

  try {
    await Yoda.call('folder_accept', { coll: Yoda.basePath + folder })
    $('#statusBadge').html('Accepted')
  } catch (e) {
    $('#statusBadge').html(btnText)
  }
  topInformation(folder, false)
}

async function rejectFolder (folder) {
  const btnText = $('#statusBadge').html()
  $('#statusBadge').html('Reject <i class="fa-solid fa-spinner fa-spin fa-fw"></i>')
  $('.btn-group button.folder-status').prop('disabled', true).next().prop('disabled', true)

  try {
    await Yoda.call('folder_reject', { coll: Yoda.basePath + folder })
    $('#statusBadge').html('Rejected')
  } catch (e) {
    $('#statusBadge').html(btnText)
  }
  topInformation(folder, false)
}

function logUpload (id, file) {
  const log = `<div class="row upload-row" id="${id}">
                  <div class="col-md-6">
                    <div class="upload-filename">${Yoda.htmlEncode(file)}</div>
                    <div class="upload-btns btn-group btn-group-sm" role="group" aria-label="Basic example">
                      <div class="overwrite-div hidden">
                        Overwrite?
                        <button type="button" class="btn btn-secondary upload-overwrite">
                        Yes
                        </button>
                        <button type="button" class="btn btn-secondary upload-no-overwrite">
                        No
                        </button>
                      </div>
                      <button type="button" class="btn btn-secondary upload-cancel me-1">
                        Cancel
                      </button>
                      <button type="button" class="btn btn-secondary upload-resume hide me-1">
                        Resume
                      </button>
                      <button type="button" class="btn btn-secondary upload-pause">
                        Pause
                      </button>
                      <button type="button" class="btn btn-secondary upload-retry hide">
                        Retry
                      </button>
                    </div>
                  </div>
                  <div class="col-md-3"><div class="progress mt-1"><div class="progress-bar progress-bar-striped bg-info"></div></div></div>
                  <div class="col-md-3 msg"><i class="fa-solid fa-spinner fa-spin fa-fw"></i></div>
               </div>`
  $('#files').append(log)
}
